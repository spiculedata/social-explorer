import { describe, it, expect } from 'vitest';
import { clampInt, keywordPatterns, dateSpanError, MAX_KEYWORDS } from './limits.ts';

describe('clampInt', () => {
  it('clamps above the maximum', () => {
    expect(clampInt('100000000', 50, 1, 500)).toBe(500);
  });

  it('clamps below the minimum', () => {
    expect(clampInt('0', 50, 1, 500)).toBe(1);
    expect(clampInt('-5', 0, 0, 100)).toBe(0);
  });

  it('falls back to the default for unparsable values instead of NaN', () => {
    expect(clampInt('abc', 50, 1, 500)).toBe(50);
    expect(clampInt(null, 50, 1, 500)).toBe(50);
    expect(clampInt(undefined, 50, 1, 500)).toBe(50);
    expect(clampInt('', 50, 1, 500)).toBe(50);
  });

  it('passes in-range values through', () => {
    expect(clampInt('42', 50, 1, 500)).toBe(42);
  });
});

describe('keywordPatterns', () => {
  it('wraps each keyword in ILIKE wildcards', () => {
    expect(keywordPatterns('a,b')).toEqual(['%a%', '%b%']);
  });

  it('drops empty items so a trailing comma never becomes a match-everything pattern', () => {
    expect(keywordPatterns('a,')).toEqual(['%a%']);
    expect(keywordPatterns(', ,')).toEqual([]);
  });

  it('caps the number of keywords', () => {
    const many = Array.from({ length: MAX_KEYWORDS + 10 }, (_, i) => `k${i}`).join(',');
    const patterns = keywordPatterns(many);
    expect(patterns).toHaveLength(MAX_KEYWORDS);
  });

  it('trims whitespace around keywords', () => {
    expect(keywordPatterns(' solar , wind ')).toEqual(['%solar%', '%wind%']);
  });
});

describe('dateSpanError', () => {
  it('accepts a span within the cap', () => {
    expect(dateSpanError('2026-01-01', '2026-12-31')).toBeNull();
  });

  it('accepts missing dates', () => {
    expect(dateSpanError(null, null)).toBeNull();
  });

  it('refuses a 9000-year span', () => {
    expect(dateSpanError('0001-01-01', '9999-12-31')).toContain('at most');
  });

  it('refuses unparsable dates', () => {
    expect(dateSpanError('not-a-date', '2026-01-01')).toContain('must be dates');
  });
});
