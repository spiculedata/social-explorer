import { vi } from 'vitest';

/**
 * Stubs `fetch` for a page test and returns the list of URLs it was asked for, in order.
 * `respond` answers each URL with a JSON body; the default is an empty successful reply.
 */
export function stubApi(respond: (url: string) => unknown = () => ({ success: true, data: [] })): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      const body = respond(url);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) } as Response);
    })
  );
  return urls;
}

/** The URLs in `urls` whose path and query contain `fragment`. */
export const requested = (urls: string[], fragment: string): string[] => urls.filter((url) => url.includes(fragment));

/** Parses the query string of an API URL. */
export const queryOf = (url: string): URLSearchParams => new URL(url, 'http://localhost').searchParams;
