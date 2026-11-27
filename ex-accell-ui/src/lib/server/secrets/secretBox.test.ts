import { describe, it, expect } from 'vitest';
import { openFromStore, sealForStore } from './secretBox';

describe('secretBox', () => {
	it('round-trips a sealed value for the same context', () => {
		const sealed = sealForStore('a-youtube-key', 'job-1');

		expect(sealed).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
		expect(sealed).not.toContain('a-youtube-key');
		expect(openFromStore(sealed, 'job-1')).toBe('a-youtube-key');
	});

	it('binds the ciphertext to its context, so another job cannot open it', () => {
		expect(openFromStore(sealForStore('a-youtube-key', 'job-1'), 'job-2')).toBeNull();
	});

	it('returns null for a tampered, truncated or foreign value', () => {
		const sealed = sealForStore('a-youtube-key', 'job-1');
		const [version, iv, ciphertext, tag] = sealed.split(':');

		expect(openFromStore(`${version}:${iv}:${ciphertext}:${Buffer.from('tampered').toString('base64url')}`, 'job-1')).toBeNull();
		expect(openFromStore(`${version}:${iv}`, 'job-1')).toBeNull();
		expect(openFromStore('plain-key', 'job-1')).toBeNull();
		expect(openFromStore(null as unknown as string, 'job-1')).toBeNull();
	});

	it('seals each value with a fresh nonce', () => {
		expect(sealForStore('same', 'job-1')).not.toBe(sealForStore('same', 'job-1'));
	});
});
