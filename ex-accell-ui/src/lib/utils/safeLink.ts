/**
 * Only http(s) URLs are safe to put in an `href` that opens a new tab. URLs from external data
 * (a GDELT `sourceurl`, a saved field) may carry a `javascript:` or `data:` scheme; anything
 * that is not http(s) is refused rather than guessed at, so relative paths and junk fail closed.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
	if (!raw) return null;
	try {
		const url = new URL(raw);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
	} catch {
		return null;
	}
}
