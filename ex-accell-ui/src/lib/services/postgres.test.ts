import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const poolOptions = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('pg', () => ({
  Pool: class {
    constructor(options: Record<string, unknown>) {
      poolOptions.current = options;
    }
    async connect() {
      return {
        query: vi.fn(async () => ({ rows: [{ test: 1 }] })),
        release: () => {}
      };
    }
    async end() {}
    on() {}
  }
}));
vi.mock('dotenv/config', () => ({}));

import { postgresPool } from './postgres.ts';

beforeEach(async () => {
  await postgresPool.close();
  poolOptions.current = null;
});

afterEach(() => {
  delete process.env.POSTGRES_STATEMENT_TIMEOUT_MS;
});

describe('the Postgres pool sets a statement timeout', () => {
  it('bounds every connection by default', async () => {
    delete process.env.POSTGRES_STATEMENT_TIMEOUT_MS;
    await postgresPool.connect();

    expect(poolOptions.current).not.toBeNull();
    expect(poolOptions.current!.statement_timeout).toBe(120000);
  });

  it('follows POSTGRES_STATEMENT_TIMEOUT_MS', async () => {
    process.env.POSTGRES_STATEMENT_TIMEOUT_MS = '5000';
    await postgresPool.connect();

    expect(poolOptions.current!.statement_timeout).toBe(5000);
  });

  it('falls back to the default for a nonsense value', async () => {
    process.env.POSTGRES_STATEMENT_TIMEOUT_MS = 'soon';
    await postgresPool.connect();

    expect(poolOptions.current!.statement_timeout).toBe(120000);
  });
});
