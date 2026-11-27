import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeQuery = vi.hoisted(() => vi.fn());
vi.mock('#lib/server/analytics/executeQuery.ts', () => ({ executeQuery }));

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('#lib/utils/logger.ts', () => ({ createLogger: () => log }));

import { POST } from './+server';

describe('POST /api/gdelt/refresh-views', () => {
	beforeEach(() => {
		executeQuery.mockReset();
		for (const fn of Object.values(log)) fn.mockReset();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('refreshes the five GDELT materialized views in order and answers a generic success', async () => {
		executeQuery.mockResolvedValue([]);
		const response = await POST();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(JSON.stringify(body)).not.toMatch(/boom|error/i);
		expect(executeQuery.mock.calls.map(([sql]) => sql)).toEqual([
			'REFRESH MATERIALIZED VIEW gdelt_summary_monthly',
			'REFRESH MATERIALIZED VIEW gdelt_country_monthly',
			'REFRESH MATERIALIZED VIEW gdelt_eventtype_monthly',
			'REFRESH MATERIALIZED VIEW gdelt_actors_monthly',
			'REFRESH MATERIALIZED VIEW gdelt_daily_stats'
		]);
	});

	it('answers 409 while another refresh is still running', async () => {
		let release!: () => void;
		executeQuery.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
		const first = POST();
		const second = await POST();
		expect(second.status).toBe(409);
		expect(second.headers.get('content-type')).toContain('application/json');
		release();
		// the remaining views resolve immediately once the running refresh is released
		executeQuery.mockResolvedValue([]);
		expect((await first).status).toBe(200);
	});

	it('answers a generic 500 and logs the database detail server-side', async () => {
		executeQuery.mockRejectedValue(new Error('boom: secret database detail'));
		const response = await POST();
		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body).toEqual({ success: false, error: 'Failed to refresh materialized views' });
		expect(JSON.stringify(body)).not.toContain('boom');
		expect(log.error).toHaveBeenCalledTimes(1);
		expect(String(log.error.mock.calls[0][1]?.detail)).toContain('boom: secret database detail');
		expect(String(log.error.mock.calls[0][1]?.detail)).toContain('gdelt_summary_monthly');
	});
});
