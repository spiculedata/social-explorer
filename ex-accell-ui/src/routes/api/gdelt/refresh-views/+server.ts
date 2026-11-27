// POST /api/gdelt/refresh-views — refresh the GDELT materialized views (admin only).
// A non-concurrent REFRESH takes an exclusive lock and rescans the underlying tables, so this is
// state-changing work that blocks the GDELT dashboards while it runs: the auth guard
// (src/lib/server/auth/guard.ts) keeps the route to admins, and only POST is served.
// Database error text is logged, never returned to the client (see AGENTS.md invariant 5).
import { json } from '@sveltejs/kit';
import { executeQuery } from '#lib/server/analytics/executeQuery.ts';
import { createLogger } from '#lib/utils/logger.ts';

const log = createLogger('gdelt-refresh');

const VIEWS = [
  'gdelt_summary_monthly',
  'gdelt_country_monthly',
  'gdelt_eventtype_monthly',
  'gdelt_actors_monthly',
  'gdelt_daily_stats'
];

/** Only one refresh runs at a time: a second concurrent refresh would queue behind the same locks. */
let inFlight: Promise<void> | null = null;

async function runRefresh(): Promise<void> {
  for (const view of VIEWS) {
    try {
      await executeQuery(`REFRESH MATERIALIZED VIEW ${view}`);
    } catch (error) {
      // Keep the database error object for the server-side log below; the client gets a generic message
      throw Object.assign(new Error(`Refreshing ${view} failed`), { cause: error });
    }
  }
}

export async function POST() {
  if (inFlight) {
    return json({ success: false, error: 'A refresh is already in progress' }, { status: 409 });
  }

  inFlight = runRefresh().finally(() => {
    inFlight = null;
  });

  try {
    await inFlight;
  } catch (error) {
    log.error('GDELT materialized view refresh failed', { detail: error instanceof Error ? `${error.message}: ${error.cause instanceof Error ? error.cause.message : error.cause}` : String(error) });
    return json({ success: false, error: 'Failed to refresh materialized views' }, { status: 500 });
  }

  return json({ success: true, data: { views: VIEWS }, message: 'Materialized views refreshed' });
}
