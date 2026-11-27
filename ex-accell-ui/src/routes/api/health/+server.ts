// Public health endpoint. It answers `{ status }` only: no error text, host, uptime or table
// counts, and the dependency-check detail goes to the server log, not the client.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { postgresPool } from '#lib/services/postgres.ts';
import { createLogger } from '#lib/utils/logger.ts';

const log = createLogger('health');

// The endpoint is public and unauthenticated, so the database check runs at most once per TTL and
// every other hit is answered from the cached result: a flood of probes cannot become a flood of
// queries.
const CACHE_TTL_MS = 15_000;

let cache: { at: number; status: string } | null = null;

/** True when the pool answers a trivial query. Any failure is logged server-side, never returned. */
async function postgresHealthy(): Promise<boolean> {
  try {
    return await postgresPool.healthCheck();
  } catch (err) {
    log.error('Postgres health check failed', { detail: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** The public status: 'healthy' or 'degraded', cached for CACHE_TTL_MS. */
async function currentStatus(): Promise<string> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.status;

  const status = (await postgresHealthy()) ? 'healthy' : 'degraded';
  cache = { at: now, status };
  return status;
}

export const GET: RequestHandler = async () => {
  const status = await currentStatus();
  return json(
    { status },
    {
      status: status === 'healthy' ? 200 : 503,
      headers: { 'Cache-Control': 'no-cache' }
    }
  );
};

/**
 * HEAD /api/health
 * Minimal health check for simple probes
 */
export const HEAD: RequestHandler = async () => {
  try {
    return new Response(null, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    return new Response(null, {
      status: 503
    });
  }
};
