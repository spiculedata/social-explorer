import { describe, it, expect, vi, beforeEach } from 'vitest';

const duckdbQuery = vi.hoisted(() => vi.fn());

vi.mock('#lib/services/postgres.ts', () => ({ postgresPool: { duckdbQuery } }));

import { investigationsHandlers } from './investigations.ts';
import { radioHandlers } from './radio.ts';
import type { AnalyticsContext, AnalyticsHandler } from './types.ts';

const call = (handler: AnalyticsHandler, query = ''): Promise<Response> =>
  handler({ url: new URL(`http://localhost/api/unified-analytics${query}`), scope: null, type: 'test' } as AnalyticsContext);

const investigationCall = (type: string, query: string) => call(investigationsHandlers[type]!, `/api/unified-analytics?type=${type}${query}`);

beforeEach(() => {
  duckdbQuery.mockReset();
  duckdbQuery.mockResolvedValue([]);
});

const paramsOf = () => duckdbQuery.mock.calls.at(-1)?.[1] ?? [];

describe('investigation handlers clamp request-chosen sizes', () => {
  it('clamps limit=100000000 instead of passing it to SQL', async () => {
    const response = await investigationCall('investigation-gdelt-events', '&keywords=a&date_start=2026-01-01&date_end=2026-01-31&limit=100000000');
    expect(response.status).toBe(200);
    expect(paramsOf()[3]).toBe(500);
  });

  it('falls back to the default for limit=abc instead of NaN reaching the query', async () => {
    const response = await investigationCall('investigation-gdelt-events', '&keywords=a&date_start=2026-01-01&date_end=2026-01-31&limit=abc');
    expect(response.status).toBe(200);
    expect(paramsOf()[3]).toBe(100);
  });

  it('uses the documented default when limit is absent', async () => {
    await investigationCall('investigation-radio-segments', '&keywords=a&date_start=2026-01-01&date_end=2026-01-31');
    expect(paramsOf()[3]).toBe(50);
  });

  it('refuses a 9000-year date span with 400', async () => {
    const response = await investigationCall('investigation-timeline', '&keywords=a&date_start=0001-01-01&date_end=9999-12-31');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
    expect(duckdbQuery).not.toHaveBeenCalled();
  });

  it('accepts a span within the cap', async () => {
    const response = await investigationCall('investigation-timeline', '&keywords=a&date_start=2026-01-01&date_end=2026-12-31');
    expect(response.status).toBe(200);
  });

  it.each([
    'investigation-timeline',
    'investigation-gdelt-events',
    'investigation-radio-segments',
    'investigation-social-posts',
    'investigation-keyword-overlap',
    'investigation-locations',
    'investigation-actors'
  ])('drops empty keywords from %s so a trailing comma never matches every row', async (type) => {
    await investigationCall(type, '&keywords=a,&date_start=2026-01-01&date_end=2026-01-31');
    const patterns = paramsOf()[2];
    expect(patterns).toEqual(['%a%']);
    expect(patterns).not.toContain('%%');
  });
});

describe('radio-transcripts clamps paging', () => {
  const radioCall = (query: string) => call(radioHandlers['radio-transcripts']!, `?type=radio-transcripts${query}`);

  it('clamps limit above the maximum and a negative offset', async () => {
    await radioCall('&limit=100000000&offset=-5');
    expect(paramsOf().at(-2)).toBe(200);
    expect(paramsOf().at(-1)).toBe(0);
  });

  it('falls back to the defaults for unparsable values', async () => {
    await radioCall('&limit=abc&offset=xyz');
    expect(paramsOf().at(-2)).toBe(50);
    expect(paramsOf().at(-1)).toBe(0);
  });
});
