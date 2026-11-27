import type { RequestHandler } from './$types';
import { apiFail, apiOk, apiServerError, readJsonObject } from '#lib/server/apiResponse.ts';
import { jobStateStore, type JobState } from '#lib/services/jobStateStore.ts';
import { assertSafeIdentifier } from '#lib/utils/pathSafety.ts';

/**
 * Job State API - Dedicated endpoint for managing job state updates
 * Used by the telegram-scraper and other crawlers to update job execution status
 */

const MAX_STATE_BODY_BYTES = 256 * 1024;
const JOB_STATUSES = ['scheduled', 'running', 'completed', 'failed', 'cancelled'];

type Data = Record<string, unknown>;

/** Maps a store failure: Dapr down is a 503 the crawler can retry, an unknown job is a 404, anything else a generic 500. */
function storeFailure(label: string, err: unknown, message: string): Response {
	if (err instanceof Error && err.name === 'DaprConnectionError') {
		return apiFail('Job state service unavailable. Please start the unified deployment with: npm run dev:dapr', 503);
	}
	if (err instanceof Error && /^Job .+ not found$/.test(err.message)) return apiFail('Job not found', 404);
	return apiServerError(label, err, message);
}

/** Applies one crawler-reported action to a job; false when the action is not one we know. */
async function applyAction(action: string, jobId: string, data: Data): Promise<boolean> {
	switch (action) {
		case 'start':
			await jobStateStore.updateJobStatus(jobId, 'running', { result: { success: true, message: 'Job execution started' } });
			await jobStateStore.addJobLog(jobId, 'Job execution started');
			return true;

		case 'progress': {
			const message = data.message as string | undefined;
			await jobStateStore.updateJobStatus(jobId, 'running', {
				result: { success: true, message: message || 'Job in progress', itemsProcessed: (data.itemsProcessed as number) || 0 }
			});
			if (message) await jobStateStore.addJobLog(jobId, message);
			return true;
		}

		case 'complete': {
			const message = data.message as string | undefined;
			await jobStateStore.updateJobStatus(jobId, 'completed', {
				result: { success: true, message: message || 'Job completed successfully', itemsProcessed: (data.itemsProcessed as number) || 0 }
			});
			await jobStateStore.addJobLog(jobId, message || 'Job completed successfully');
			return true;
		}

		case 'fail': {
			const jobError = data.error as string | undefined;
			await jobStateStore.updateJobStatus(jobId, 'failed', {
				result: { success: false, message: jobError || 'Job failed', errors: (data.errors as string[]) || [] }
			});
			await jobStateStore.addJobLog(jobId, `Job failed: ${jobError || 'Unknown error'}`);
			return true;
		}

		case 'log':
			if (data.logMessage) await jobStateStore.addJobLog(jobId, data.logMessage as string);
			return true;

		default:
			return false;
	}
}

/** Reads the jobId parameter, rejecting anything that could travel as a sidecar URL path (400). */
function assertJobId(raw: unknown): string | Response {
	if (typeof raw !== 'string') return apiFail('jobId must be text', 400);
	try {
		return assertSafeIdentifier(raw, 'jobId');
	} catch {
		return apiFail("Invalid jobId: must be 1-128 characters of letters, digits, '-' or '_', starting with a letter or digit", 400);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const parsed = await readJsonObject(request, MAX_STATE_BODY_BYTES);
	if ('failure' in parsed) return parsed.failure;
	const { action, jobId, ...data } = parsed.body;
	if (!action || !jobId) return apiFail('action and jobId are required', 400);
	if (typeof action !== 'string') return apiFail('action and jobId must be text', 400);
	const safeJobId = assertJobId(jobId);
	if (safeJobId instanceof Response) return safeJobId;

	try {
		if (!(await applyAction(action, safeJobId, data))) return apiFail(`Unknown action: ${action}`, 400);
		return apiOk({ action, jobId: safeJobId }, { action, jobId: safeJobId });
	} catch (err) {
		return storeFailure('POST /api/job-state', err, 'Internal server error while updating job state');
	}
};

export const GET: RequestHandler = async ({ url }) => {
	const jobId = url.searchParams.get('jobId');
	const status = url.searchParams.get('status');
	if (status && !JOB_STATUSES.includes(status)) return apiFail(`status must be one of: ${JOB_STATUSES.join(', ')}`, 400);
	let safeJobId: string | null = null;
	if (jobId) {
		const checked = assertJobId(jobId);
		if (checked instanceof Response) return checked;
		safeJobId = checked;
	}

	try {
		if (safeJobId) {
			const jobState = await jobStateStore.getJobState(safeJobId);
			if (!jobState) return apiFail('Job not found', 404);
			return apiOk(jobState);
		}
		if (status) return apiOk(await jobStateStore.getJobsByStatus(status as JobState['status']));
		return apiOk(await jobStateStore.getAllJobStates());
	} catch (err) {
		return storeFailure('GET /api/job-state', err, 'Internal server error while retrieving job state');
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	const parsed = await readJsonObject(request, MAX_STATE_BODY_BYTES);
	if ('failure' in parsed) return parsed.failure;
	const { jobId, status, ...additionalData } = parsed.body;
	if (!jobId || !status) return apiFail('jobId and status are required', 400);
	if (typeof status !== 'string' || !JOB_STATUSES.includes(status)) {
		return apiFail(`jobId must be text and status one of: ${JOB_STATUSES.join(', ')}`, 400);
	}
	const safeJobId = assertJobId(jobId);
	if (safeJobId instanceof Response) return safeJobId;

	try {
		await jobStateStore.updateJobStatus(safeJobId, status as JobState['status'], additionalData);
		return apiOk({ jobId: safeJobId, status }, { jobId: safeJobId, status });
	} catch (err) {
		return storeFailure('PUT /api/job-state', err, 'Internal server error while updating job state');
	}
};

export const DELETE: RequestHandler = async ({ url }) => {
	const jobId = url.searchParams.get('jobId');
	if (!jobId) return apiFail('jobId is required for deletion', 400);
	const safeJobId = assertJobId(jobId);
	if (safeJobId instanceof Response) return safeJobId;

	try {
		await jobStateStore.deleteJobState(safeJobId);
		return apiOk(null, { message: `Job state ${safeJobId} deleted successfully` });
	} catch (err) {
		return storeFailure('DELETE /api/job-state', err, 'Internal server error while deleting job state');
	}
};
