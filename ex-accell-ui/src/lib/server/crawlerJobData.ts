// Allow-list validation for the crawl payload forwarded to the crawler. The crawler does not
// validate what it receives, so this route must: `urlFile` and `tdlibDatabaseUrls` are operator
// configuration, never user input, and are refused outright. Numbers are clamped to configured
// maxima, `crawlId` must be safe to build storage paths and state keys from, and `urls` must fit
// the platform.
import { isSafeIdentifier } from '#lib/utils/pathSafety.ts';

export type CrawlerPlatform = 'telegram' | 'youtube';

/** Configured maxima: a number outside the range is clamped, not forwarded. */
const NUMERIC_LIMITS = {
	maxDepth: { min: 1, max: 100, fallback: 1 },
	concurrency: { min: 1, max: 32, fallback: 1 },
	maxPosts: { min: 1, max: 1_000_000, fallback: 1000 },
	maxPages: { min: 1, max: 1_000_000 },
	minChannelVideos: { min: 1, max: 10_000, fallback: 10 },
	sampleSize: { min: 1, max: 1_000_000, fallback: 100 }
} as const;

/** Operator configuration that must never arrive in a request body. */
const OPERATOR_ONLY_FIELDS = ['urlFile', 'tdlibDatabaseUrls'] as const;

const MAX_URLS = 200;
const MAX_URL_LENGTH = 2048;
const MAX_TEXT_LENGTH = 256;
const TIME_AGO = /^\d{1,6}[dhwmy]$/;
const TELEGRAM_HANDLE = /^@[A-Za-z0-9_]{1,64}$/;
const TELEGRAM_LINK = /^https?:\/\/t\.me\//;
const TELEGRAM_PROTOCOL = /^tg:\/\//;
const HTTP_URL = /^https?:\/\//;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export interface SanitizedJobData {
	platform: CrawlerPlatform;
	urls: string[];
	crawlId?: string;
	maxDepth: number;
	concurrency: number;
	maxPosts: number;
	maxPages?: number;
	skipMedia?: boolean;
	timeAgo?: string;
	youtubeApiKey?: string;
	samplingMethod?: string;
	minChannelVideos?: number;
	sampleSize?: number;
}

export type SanitizeResult = { ok: true; data: SanitizedJobData } | { ok: false; error: string };

type Range = { min: number; max: number; fallback?: number };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function fail(error: string): { ok: false; error: string } {
	return { ok: false, error };
}

function sanitizeText(value: unknown, field: string, max: number = MAX_TEXT_LENGTH): { ok: true; value?: string } | { ok: false; error: string } {
	if (value === undefined || value === null || value === '') return { ok: true };
	if (typeof value !== 'string') return fail(`${field} must be a string`);
	const trimmed = value.trim();
	if (trimmed.length > max || CONTROL_CHARACTERS.test(trimmed)) return fail(`${field} must be at most ${max} printable characters`);
	return { ok: true, value: trimmed || undefined };
}

function sanitizeNumber(value: unknown, range: Range): { ok: true; value?: number } | { ok: false; error: string } {
	if (value === undefined || value === null || value === '') return { ok: true };
	if (typeof value !== 'number' || !Number.isFinite(value)) return fail('numeric options must be numbers');
	return { ok: true, value: Math.min(range.max, Math.max(range.min, Math.round(value))) };
}

function numberWithFallback(value: unknown, range: Range & { fallback: number }): number {
	const sanitized = sanitizeNumber(value, range);
	return sanitized.ok && sanitized.value !== undefined ? sanitized.value : range.fallback;
}

function sanitizeUrls(value: unknown, platform: CrawlerPlatform): { ok: true; value: string[] } | { ok: false; error: string } {
	if (!Array.isArray(value) || value.length === 0) return fail('urls must be a non-empty array');
	if (value.length > MAX_URLS) return fail(`urls must contain at most ${MAX_URLS} entries`);
	const urls: string[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string') return fail('every entry of urls must be a string');
		const url = entry.trim();
		if (!url || url.length > MAX_URL_LENGTH || CONTROL_CHARACTERS.test(url)) return fail('every entry of urls must be 1-2048 printable characters');
		const valid = platform === 'telegram' ? TELEGRAM_HANDLE.test(url) || TELEGRAM_LINK.test(url) || TELEGRAM_PROTOCOL.test(url) : HTTP_URL.test(url);
		if (!valid) {
			return fail(
				platform === 'telegram'
					? 'urls must be @handles, t.me links or tg:// links for telegram'
					: 'urls must be http(s) links for youtube'
			);
		}
		urls.push(url);
	}
	return { ok: true, value: urls };
}

/**
 * Reduces a job request body to the allow-listed crawl options: everything not recognised is
 * dropped, the operator-only fields are refused, numbers are clamped and text values are
 * length-capped. On failure, `error` is a message safe to return to the caller.
 */
export function sanitizeJobData(raw: unknown): SanitizeResult {
	if (!isPlainObject(raw)) return fail('data must be an object');
	for (const field of OPERATOR_ONLY_FIELDS) {
		if (field in raw) return fail(`${field} is operator configuration and is not accepted`);
	}

	if (raw.platform !== 'telegram' && raw.platform !== 'youtube') return fail('platform must be "telegram" or "youtube"');
	const platform = raw.platform;

	const urls = sanitizeUrls(raw.urls, platform);
	if (!urls.ok) return urls;

	const crawlId = sanitizeText(raw.crawlId, 'crawlId');
	if (!crawlId.ok) return crawlId;
	if (crawlId.value !== undefined && !isSafeIdentifier(crawlId.value)) {
		return fail("crawlId must be 1-128 characters of letters, digits, '-' or '_', starting with a letter or digit");
	}

	const timeAgo = sanitizeText(raw.timeAgo, 'timeAgo');
	if (!timeAgo.ok) return timeAgo;
	if (timeAgo.value !== undefined && !TIME_AGO.test(timeAgo.value)) return fail('timeAgo must be a count followed by d, h, w, m or y, such as "7d"');

	const data: SanitizedJobData = {
		platform,
		urls: urls.value,
		maxDepth: numberWithFallback(raw.maxDepth, NUMERIC_LIMITS.maxDepth),
		concurrency: numberWithFallback(raw.concurrency, NUMERIC_LIMITS.concurrency),
		maxPosts: numberWithFallback(raw.maxPosts, NUMERIC_LIMITS.maxPosts)
	};

	if (crawlId.value !== undefined) data.crawlId = crawlId.value;
	if (raw.skipMedia !== undefined && raw.skipMedia !== null) data.skipMedia = raw.skipMedia === true;
	if (timeAgo.value !== undefined) data.timeAgo = timeAgo.value;

	const maxPages = sanitizeNumber(raw.maxPages, NUMERIC_LIMITS.maxPages);
	if (!maxPages.ok) return maxPages;
	if (maxPages.value !== undefined) data.maxPages = maxPages.value;

	if (platform === 'youtube') {
		const youtubeApiKey = sanitizeText(raw.youtubeApiKey, 'youtubeApiKey');
		if (!youtubeApiKey.ok) return youtubeApiKey;
		const samplingMethod = sanitizeText(raw.samplingMethod, 'samplingMethod', 64);
		if (!samplingMethod.ok) return samplingMethod;

		const minChannelVideos = sanitizeNumber(raw.minChannelVideos, NUMERIC_LIMITS.minChannelVideos);
		if (!minChannelVideos.ok) return minChannelVideos;
		const sampleSize = sanitizeNumber(raw.sampleSize, NUMERIC_LIMITS.sampleSize);
		if (!sampleSize.ok) return sampleSize;

		if (youtubeApiKey.value !== undefined) data.youtubeApiKey = youtubeApiKey.value;
		if (samplingMethod.value !== undefined) data.samplingMethod = samplingMethod.value;
		data.minChannelVideos = minChannelVideos.value ?? NUMERIC_LIMITS.minChannelVideos.fallback;
		data.sampleSize = sampleSize.value ?? NUMERIC_LIMITS.sampleSize.fallback;
	}

	return { ok: true, data };
}
