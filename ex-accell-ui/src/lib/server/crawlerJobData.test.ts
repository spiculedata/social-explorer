import { describe, it, expect } from 'vitest';
import { sanitizeJobData } from './crawlerJobData';

const telegram = {
  platform: 'telegram',
  urls: ['@channel'],
  crawlId: 'crawl_1',
  maxDepth: 3,
  concurrency: 4,
  maxPosts: 500,
  skipMedia: false,
  timeAgo: '7d'
};

describe('sanitizeJobData', () => {
  it('keeps the allow-listed fields and clamps the numbers into their configured ranges', () => {
    const result = sanitizeJobData({ ...telegram, concurrency: 1e9, maxDepth: 0, maxPosts: -1 });

    expect(result).toMatchObject({
      ok: true,
      data: { platform: 'telegram', urls: ['@channel'], crawlId: 'crawl_1', concurrency: 32, maxDepth: 1, maxPosts: 1, skipMedia: false, timeAgo: '7d' }
    });
  });

  it('refuses the operator-only fields whatever their value', () => {
    expect(sanitizeJobData({ ...telegram, urlFile: '' })).toMatchObject({ ok: false, error: expect.stringContaining('urlFile') });
    expect(sanitizeJobData({ ...telegram, urlFile: null })).toMatchObject({ ok: false });
    expect(sanitizeJobData({ ...telegram, tdlibDatabaseUrls: [] })).toMatchObject({ ok: false, error: expect.stringContaining('tdlibDatabaseUrls') });
  });

  it('drops fields outside the allow-list', () => {
    const result = sanitizeJobData({ ...telegram, storageRoot: '/tmp', crawlLabel: 'x', droid: 'x', task: 'x', minPostDate: '2026-01-01' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.data).sort()).toEqual(['concurrency', 'crawlId', 'maxDepth', 'maxPosts', 'platform', 'skipMedia', 'timeAgo', 'urls'].sort());
    }
  });

  it('leaves crawlId off the data when it is absent', () => {
    const result = sanitizeJobData({ platform: 'telegram', urls: ['@channel'] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.crawlId).toBeUndefined();
  });

  it.each(['../etc', 'a/b', '.hidden', 'crawl id'])('refuses an unsafe crawlId of %j', (crawlId) => {
    expect(sanitizeJobData({ ...telegram, crawlId })).toMatchObject({ ok: false, error: expect.stringContaining('crawlId') });
  });

  it('refuses a platform the crawler does not have', () => {
    expect(sanitizeJobData({ ...telegram, platform: 'rss' })).toMatchObject({ ok: false, error: expect.stringContaining('platform') });
    expect(sanitizeJobData({ platform: undefined, urls: ['@channel'] })).toMatchObject({ ok: false });
  });

  it('trims the urls and accepts the shapes the platform uses', () => {
    const result = sanitizeJobData({ platform: 'telegram', urls: ['  @channel  ', 'https://t.me/channel', 'tg://resolve?domain=channel'] });

    expect(result).toMatchObject({ ok: true, data: { urls: ['@channel', 'https://t.me/channel', 'tg://resolve?domain=channel'] } });
  });

  it.each([
    [['https://evil.example.com/x'], 'telegram'],
    [['@channel'], 'youtube'],
    [[], 'telegram'],
    [['@a', 5], 'telegram'],
    [['@a\tb'], 'telegram'],
    [['@a'.repeat(100) + 'a'], 'telegram']
  ])('refuses urls of %j for %s', (urls, platform) => {
    expect(sanitizeJobData({ platform, urls })).toMatchObject({ ok: false, error: expect.stringContaining('urls') });
  });

  it('collects the youtube fields only for the youtube platform, with defaults', () => {
    const result = sanitizeJobData({ platform: 'youtube', urls: ['https://www.youtube.com/@channel'], youtubeApiKey: 'KEY', samplingMethod: 'channel', minChannelVideos: 0, sampleSize: 1e9 });
    const withoutOptional = sanitizeJobData({ platform: 'youtube', urls: ['https://www.youtube.com/@channel'] });
    const telegramWithKey = sanitizeJobData({ ...telegram, youtubeApiKey: 'KEY' });

    expect(result).toMatchObject({ ok: true, data: { minChannelVideos: 1, sampleSize: 1_000_000, samplingMethod: 'channel', youtubeApiKey: 'KEY' } });
    expect(withoutOptional).toMatchObject({ ok: true, data: { minChannelVideos: 10, sampleSize: 100 } });
    expect(telegramWithKey.ok).toBe(true);
    if (telegramWithKey.ok) expect(telegramWithKey.data.youtubeApiKey).toBeUndefined();
  });

  it('refuses strings that are too long or carry control characters', () => {
    const youtube = { platform: 'youtube', urls: ['https://www.youtube.com/@channel'] };
    expect(sanitizeJobData({ ...youtube, youtubeApiKey: 'k'.repeat(300) })).toMatchObject({ ok: false, error: expect.stringContaining('youtubeApiKey') });
    expect(sanitizeJobData({ ...youtube, youtubeApiKey: 'k\nl' })).toMatchObject({ ok: false, error: expect.stringContaining('youtubeApiKey') });
    expect(sanitizeJobData({ ...youtube, youtubeApiKey: 5 })).toMatchObject({ ok: false, error: expect.stringContaining('youtubeApiKey') });
    expect(sanitizeJobData({ ...youtube, samplingMethod: 's'.repeat(300) })).toMatchObject({ ok: false, error: expect.stringContaining('samplingMethod') });
    expect(sanitizeJobData({ ...telegram, timeAgo: 'yesterday' })).toMatchObject({ ok: false, error: expect.stringContaining('timeAgo') });
    expect(sanitizeJobData({ ...telegram, timeAgo: '7d\nx' })).toMatchObject({ ok: false });
  });

  it('clamps maxPages only when it is present and coerces skipMedia to a boolean', () => {
    const withMaxPages = sanitizeJobData({ ...telegram, maxPages: 1e9, skipMedia: 'yes' });
    const without = sanitizeJobData({ platform: 'telegram', urls: ['@channel'], crawlId: 'crawl_1', maxDepth: 3, concurrency: 4, maxPosts: 500, timeAgo: '7d' });

    expect(withMaxPages).toMatchObject({ ok: true, data: { maxPages: 1_000_000, skipMedia: false } });
    expect(without.ok).toBe(true);
    if (without.ok) {
      expect(without.data.maxPages).toBeUndefined();
      expect(without.data.skipMedia).toBeUndefined();
    }
  });

  it('refuses a body that is not an object', () => {
    expect(sanitizeJobData('x')).toMatchObject({ ok: false, error: expect.stringContaining('object') });
    expect(sanitizeJobData(['x'])).toMatchObject({ ok: false });
    expect(sanitizeJobData(null)).toMatchObject({ ok: false });
  });
});
