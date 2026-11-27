/**
 * Redaction of the secret job-data fields (the YouTube API key, clear in legacy states and
 * sealed in new ones) so no `/api/jobs` or `/api/job-state` response ever carries a key,
 * whatever role the caller has. See `src/lib/server/secrets/secretBox.ts` for the sealing.
 */

/** Job-data fields that hold a YouTube key in clear (legacy states) or sealed, and must never leave the server. */
export const SECRET_JOB_DATA_FIELDS = ['youtubeApiKey', 'youtubeApiKeyEnc'] as const;

/** Copies a job state without its secret job-data fields. Non-objects pass through untouched. */
export function redactJobState<T>(state: T): T {
	if (!state || typeof state !== 'object') return state;
	const clone = { ...(state as { jobData?: Record<string, unknown> }) };
	if (clone.jobData && typeof clone.jobData === 'object') {
		clone.jobData = { ...clone.jobData };
		for (const field of SECRET_JOB_DATA_FIELDS) delete clone.jobData[field];
	}
	return clone as T;
}

/** Applies `redactJobState` to a list of job states. */
export function redactJobStates<T>(states: T[]): T[] {
	return states.map(redactJobState);
}

const SECRET_FIELD_SET: ReadonlySet<string> = new Set(SECRET_JOB_DATA_FIELDS);

/** Recursively removes the secret job-data fields from arbitrary parsed values, including JSON-encoded payloads (Dapr job data). */
export function deepRedactJobData(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(deepRedactJobData);
	if (value && typeof value === 'object') {
		const clone: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			if (SECRET_FIELD_SET.has(key)) continue;
			clone[key] = deepRedactJobData(item);
		}
		return clone;
	}
	if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
		try {
			const redacted = JSON.stringify(deepRedactJobData(JSON.parse(value)));
			return redacted === value ? value : redacted;
		} catch {
			return value;
		}
	}
	return value;
}
