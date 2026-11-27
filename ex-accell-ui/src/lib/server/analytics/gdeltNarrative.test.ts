import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const duckdbQuery = vi.hoisted(() => vi.fn());

vi.mock('#lib/services/postgres.ts', () => ({ postgresPool: { duckdbQuery } }));

import { gdeltNarrativeHandlers } from './gdeltNarrative.ts';

const call = (query = '') =>
  gdeltNarrativeHandlers['gdelt-narrative-summary']!({
    url: new URL(`http://localhost/api/unified-analytics?type=gdelt-narrative-summary${query}`),
    scope: null,
    type: 'gdelt-narrative-summary'
  } as Parameters<NonNullable<typeof gdeltNarrativeHandlers[string]>>[0]);

beforeEach(() => {
  duckdbQuery.mockReset();
  duckdbQuery.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gdelt-narrative-summary', () => {
  it('bounds the model call with an abort signal', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) =>
      new Response(JSON.stringify({ response: 'briefing' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await call('&country=FR');
    expect(response.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('answers 502 when the model call times out', async () => {
    process.env.OLLAMA_TIMEOUT_MS = '1000';
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
      })));

    const response = await call('&country=FR');
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ success: false });
  }, 10000);
});
