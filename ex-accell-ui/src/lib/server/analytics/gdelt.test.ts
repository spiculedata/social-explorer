import { describe, it, expect, vi, beforeEach } from 'vitest';

const duckdbQuery = vi.hoisted(() => vi.fn());

vi.mock('#lib/services/postgres.ts', () => ({ postgresPool: { duckdbQuery } }));

import { gdeltHandlers } from './gdelt.ts';
import type { AnalyticsContext } from './types.ts';

const call = (type: string, query: string) =>
  gdeltHandlers[type]!({ url: new URL(`http://localhost/api/unified-analytics?type=${type}${query}`), scope: null, type } as AnalyticsContext);

beforeEach(() => {
  duckdbQuery.mockReset();
  duckdbQuery.mockResolvedValue([]);
});

describe('gdelt handlers clamp request-chosen limits', () => {
  it('clamps limit=100000000 and falls back for unparsable values', async () => {
    await call('gdelt-by-country', '&limit=100000000');
    expect(duckdbQuery.mock.calls.at(-1)![1].at(-1)).toBe(200);

    await call('gdelt-top-actors', '&limit=abc');
    expect(duckdbQuery.mock.calls.at(-1)![1].at(-1)).toBe(20);
  });
});
