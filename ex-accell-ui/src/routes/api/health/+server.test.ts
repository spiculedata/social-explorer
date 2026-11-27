import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { healthCheck } = vi.hoisted(() => ({ healthCheck: vi.fn() }));
vi.mock('#lib/services/postgres.ts', () => ({ postgresPool: { healthCheck } }));

import { GET } from './+server';

// Each test starts well after the previous test's cache TTL, so the dependency check runs again
let nowMs = 1_000_000;

const call = () => GET({ url: new URL('http://localhost/api/health') } as Parameters<typeof GET>[0]);

beforeEach(() => {
  healthCheck.mockReset();
  nowMs += 600_000;
  vi.useFakeTimers();
  vi.setSystemTime(nowMs);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/health', () => {
  it('answers 200 with only a status when the database is healthy', async () => {
    healthCheck.mockResolvedValue(true);

    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'healthy' });
  });

  it('answers 503 with no error text, host or uptime when the database is down', async () => {
    healthCheck.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const response = await call();
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(body).not.toContain('ECONNREFUSED');
    expect(body).not.toContain('10.0.0.5');
    expect(body).not.toContain('uptime');
    expect(body).not.toContain('timestamp');
  });

  it('answers 503 with no detail when the health check reports unhealthy', async () => {
    healthCheck.mockResolvedValue(false);

    const response = await call();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'degraded' });
  });

  it('reuses the cached result within the TTL so a flood of probes cannot flood the database', async () => {
    healthCheck.mockResolvedValue(true);

    await call();
    vi.setSystemTime(nowMs + 1_000);
    await call();

    expect(healthCheck).toHaveBeenCalledTimes(1);
  });
});
