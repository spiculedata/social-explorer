import { describe, it, expect, vi, beforeEach } from 'vitest';

const { duckdbQuery, logFns } = vi.hoisted(() => ({
  duckdbQuery: vi.fn(),
  logFns: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('#lib/services/postgres.ts', () => ({ postgresPool: { duckdbQuery } }));
vi.mock('#lib/utils/logger.ts', () => ({ createLogger: () => logFns }));

import { POST } from './+server';

const post = (body: unknown) =>
  POST({
    request: new Request('http://localhost/api/unified-analytics/query', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  } as Parameters<typeof POST>[0]);

beforeEach(() => {
  duckdbQuery.mockReset();
  logFns.debug.mockReset();
  logFns.info.mockReset();
  logFns.warn.mockReset();
  logFns.error.mockReset();
});

describe('POST /api/unified-analytics/query', () => {
  it('runs the query with its params and converts bigints', async () => {
    duckdbQuery.mockResolvedValue([{ n: 5n, label: 'a' }]);

    const response = await post({ sql: 'SELECT $1', params: [1] });

    expect(duckdbQuery).toHaveBeenCalledWith('SELECT $1', [1]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: [{ n: 5, label: 'a' }], rowCount: 1 });
  });

  it('answers 400 in the envelope when sql is missing', async () => {
    const response = await post({});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, data: null, error: 'SQL query is required' });
    expect(duckdbQuery).not.toHaveBeenCalled();
  });

  it('answers 400 when params is not an array', async () => {
    const response = await post({ sql: 'SELECT $1', params: 'x' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, data: null, error: 'params must be an array' });
    expect(duckdbQuery).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await post('not json');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, data: null });
  });

  it('keeps the message of a Postgres syntax error (SQLSTATE 42601) for the admin', async () => {
    duckdbQuery.mockRejectedValue(Object.assign(new Error('syntax error at or near "SELEC"'), { code: '42601' }));

    const response = await post({ sql: 'SELEC 1' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, data: null, error: 'syntax error at or near "SELEC"' });
  });

  it('logs an executed query as length and hash, never the statement itself', async () => {
    duckdbQuery.mockResolvedValue([{ n: 1 }]);

    const sql = "SELECT 'collected text literal' AS leak";
    await post({ sql, params: [] });

    const call = logFns.info.mock.calls.find(([message]) => message === 'Executing SQL query');
    expect(call).toBeDefined();
    const [, data] = call!;
    expect(data).toEqual({ length: sql.length, hash: expect.any(String) });
    expect(data.hash).toMatch(/^[0-9a-f]{16}$/);
    // No log line of any level carries the statement or its literals
    for (const fn of Object.values(logFns)) {
      for (const logged of fn.mock.calls) {
        expect(JSON.stringify(logged)).not.toContain(sql);
      }
    }
  });

  it('answers a generic 500 and no detail for an undefined table', async () => {
    duckdbQuery.mockRejectedValue(Object.assign(new Error('relation "secret_table" does not exist'), { code: '42P01' }));

    const response = await post({ sql: 'SELECT 1' });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, data: null, error: 'Query failed' });
  });

  it.each([
    ['an undefined table', 'relation "secret_table" does not exist', '42P01'],
    ['a connection fault', 'connect ECONNREFUSED 10.0.0.5:5432', 'ECONNREFUSED'],
    ['an error without a code', 'password authentication failed for user "app"', undefined]
  ])('answers a generic 500 and no detail for %s', async (_name, message, code) => {
    duckdbQuery.mockRejectedValue(Object.assign(new Error(message), { code }));

    const response = await post({ sql: 'SELECT 1' });
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ success: false, data: null, error: 'Query failed' });
    expect(text).not.toContain(message);
  });
});
