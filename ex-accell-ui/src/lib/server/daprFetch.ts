// Fetch wrapper for calls to the Dapr sidecar HTTP API (port 3500). When DAPR_API_TOKEN is
// set — docker compose gives the same value to the ui container and its sidecar — the sidecar
// answers 401 to any request that does not carry the dapr-api-token header, so send it.
// With no token configured (local `dapr run` development) the request goes out unchanged.

export const DAPR_API_TOKEN_HEADER = 'dapr-api-token';

export async function daprFetch(url: string | URL, init?: RequestInit): Promise<Response> {
	const token = process.env.DAPR_API_TOKEN;
	if (!token) return fetch(url, init);
	const headers = new Headers(init?.headers);
	headers.set(DAPR_API_TOKEN_HEADER, token);
	return fetch(url, { ...init, headers });
}
