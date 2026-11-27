import { describe, expect, it } from 'vitest';
import { safeExternalUrl } from './safeLink.ts';

describe('safeExternalUrl', () => {
  it('keeps http(s) URLs', () => {
    expect(safeExternalUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1');
    expect(safeExternalUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('rejects script and other non-http(s) schemes', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>')).toBeNull();
    expect(safeExternalUrl('vbscript:x')).toBeNull();
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects relative paths and junk rather than guessing a scheme', () => {
    expect(safeExternalUrl('/relative/path')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});
