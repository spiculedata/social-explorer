import { afterEach, describe, expect, it, vi } from 'vitest';

import { DAPR_API_TOKEN_HEADER, daprFetch } from './daprFetch';

const fetchMock = vi.fn();
const reply = () => new Response(null, { status: 204 });

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('daprFetch', () => {
  it('leaves the request untouched when no DAPR_API_TOKEN is configured', async () => {
    vi.stubEnv('DAPR_API_TOKEN', '');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(reply());

    await daprFetch('http://localhost:3500/v1.0/state/statestore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[]'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1.0/state/statestore');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has(DAPR_API_TOKEN_HEADER)).toBe(false);
  });

  it('adds the dapr-api-token header when DAPR_API_TOKEN is set', async () => {
    vi.stubEnv('DAPR_API_TOKEN', 'secret-sidecar-token');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(reply());

    await daprFetch('http://localhost:3500/v1.0/metadata');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3500/v1.0/metadata');
    expect(init.headers.get(DAPR_API_TOKEN_HEADER)).toBe('secret-sidecar-token');
  });

  it('keeps the caller’s headers and body when adding the token', async () => {
    vi.stubEnv('DAPR_API_TOKEN', 'secret-sidecar-token');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(reply());

    await daprFetch('http://localhost:3500/v1.0-alpha1/jobs/j1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(init.headers.get('Content-Type')).toBe('application/json');
    expect(init.headers.get(DAPR_API_TOKEN_HEADER)).toBe('secret-sidecar-token');
  });
});
