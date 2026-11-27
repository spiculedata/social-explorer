import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Server-side secret box for values that must never sit in clear in the Dapr state store
 * or in an API response (for example, the YouTube API key of a scheduled crawl job).
 *
 * The key is derived from SESSION_SECRET, the secret the app already requires in production;
 * without one (local development) an ephemeral per-process key is used, so sealed values do
 * not survive a restart but no secret is written in clear either. Each ciphertext is bound to
 * a context (the owning job's id) as AES-GCM additional data, so a value sealed for one job
 * cannot be replayed as another job's key.
 */

const VERSION = 'v1';
const KEY = process.env.SESSION_SECRET ? createHash('sha256').update(process.env.SESSION_SECRET).digest() : randomBytes(32);

/** Seals `plain` for `context`; returns `v1:<iv>:<ciphertext>:<tag>` with base64url parts. */
export function sealForStore(plain: string, context: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', KEY, iv).setAAD(Buffer.from(context, 'utf8'));
	const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [VERSION, iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join(':');
}

/** Opens a value sealed by `sealForStore` for the same `context`; null when it does not match or was tampered with. */
export function openFromStore(sealed: string, context: string): string | null {
	const parts = typeof sealed === 'string' ? sealed.split(':') : [];
	if (parts.length !== 4 || parts[0] !== VERSION) return null;
	try {
		const [, iv, ciphertext, tag] = parts;
		const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url')).setAAD(Buffer.from(context, 'utf8'));
		decipher.setAuthTag(Buffer.from(tag, 'base64url'));
		return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
	} catch {
		return null;
	}
}
