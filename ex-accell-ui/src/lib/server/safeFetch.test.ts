import { describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { Agent, fetch as undiciFetch } from 'undici';
import { TooLargeError, UnsafeUrlError, fetchPublic, guardedLookup, isPublicIp, readCapped } from './safeFetch';

describe('isPublicIp', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])('treats %s as public', (ip) => expect(isPublicIp(ip)).toBe(true));

  it.each([
    '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.0.1', '192.88.99.1', '168.63.129.16',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'
  ])('treats %s as private or special', (ip) => expect(isPublicIp(ip)).toBe(false));

  it('does not mistake nearby public ranges for private ones', () => {
    expect(isPublicIp('172.32.0.1')).toBe(true);
    expect(isPublicIp('100.128.0.1')).toBe(true);
    expect(isPublicIp('11.0.0.1')).toBe(true);
  });

  it('refuses anything that is not an IP address', () => expect(isPublicIp('example.com')).toBe(false));
});

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const ok = () => new Response('img', { status: 200 });

describe('fetchPublic', () => {
  it('fetches a public address', async () => {
    const fetchImpl = vi.fn(async () => ok());
    const response = await fetchPublic('https://example.com/a.png', {}, { lookup: publicLookup, fetchImpl });
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    'http://127.0.0.1/a.png', 'http://localhost/a.png', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/a.png', 'http://10.0.0.8:5432/',
    'http://user:pass@example.com/a.png', 'ftp://example.com/a.png', 'file:///etc/passwd'
  ])('refuses %s without making a request', async (url) => {
    const fetchImpl = vi.fn(async () => ok());
    const lookup = async (host: string) => (host === 'localhost' ? [{ address: '127.0.0.1', family: 4 }] : publicLookup());
    await expect(fetchPublic(url, {}, { lookup, fetchImpl })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a name that resolves to an internal address, including when only one of several answers is internal', async () => {
    const fetchImpl = vi.fn(async () => ok());
    const mixed = async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.9', family: 4 }];
    await expect(fetchPublic('https://evil.example/a.png', {}, { lookup: mixed, fetchImpl })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('checks every redirect, so a public page cannot bounce the request to an internal one', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).startsWith('https://example.com') ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/' } }) : ok()
    );
    await expect(fetchPublic('https://example.com/a.png', {}, { lookup: publicLookup, fetchImpl })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('follows a safe redirect, resolving a relative location', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url) === 'https://example.com/a.png' ? new Response(null, { status: 301, headers: { location: '/b.png' } }) : ok()
    );
    const response = await fetchPublic('https://example.com/a.png', {}, { lookup: publicLookup, fetchImpl });
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenLastCalledWith('https://example.com/b.png', expect.objectContaining({ redirect: 'manual' }));
  });

  it('stops after too many redirects', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://example.com/loop' } }));
    await expect(fetchPublic('https://example.com/a.png', {}, { lookup: publicLookup, fetchImpl })).rejects.toThrow(/redirect/i);
  });

  it('says why in words a person can read', async () => {
    await expect(fetchPublic('http://127.0.0.1/', {}, { lookup: publicLookup, fetchImpl: vi.fn() })).rejects.toThrow('That address points to a private or internal network, so it cannot be analysed.');
  });
});

describe('hostnames that look different but mean the same thing', () => {
  it.each(['http://localhost./a.png', 'http://LOCALHOST/a.png', 'http://app.localhost/a.png', 'http://2130706433/', 'http://0x7f.1/', 'http://017700000001/', 'http://127.1/', 'http://[::ffff:127.0.0.1]/', 'http://[64:ff9b::7f00:1]/', 'http://[2002:7f00:1::]/'])(
    'refuses %s',
    async (url) => {
      const fetchImpl = vi.fn(async () => ok());
      await expect(fetchPublic(url, {}, { lookup: publicLookup, fetchImpl })).rejects.toBeInstanceOf(UnsafeUrlError);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it('does not reveal, for a name, whether it resolved to a private address', async () => {
    const internal = async () => [{ address: '10.0.0.9', family: 4 }];
    const error = await fetchPublic('https://intranet.example/a.png', {}, { lookup: internal, fetchImpl: vi.fn() }).catch((e) => e);
    expect(error).toBeInstanceOf(UnsafeUrlError);
    expect(error.message).toBe('The image could not be downloaded. Check the address, and that the site allows downloads.');
  });
});

describe('redirect responses', () => {
  it('release their body so the connection is not left open', async () => {
    const cancel = vi.fn(async () => {});
    const redirect = { status: 302, headers: new Headers({ location: 'https://example.com/b.png' }), body: { cancel } } as unknown as Response;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => (String(url).endsWith('/a.png') ? redirect : ok()));
    await fetchPublic('https://example.com/a.png', {}, { lookup: publicLookup, fetchImpl });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('guardedLookup (the check made at connection time, so a name cannot change its answer after being checked)', () => {
  const answering = (addresses: { address: string; family: number }[]) => (_host: string, _opts: unknown, cb: (e: Error | null, a?: unknown) => void) => cb(null, addresses);

  it('passes public answers through', async () => {
    const result = await new Promise((resolve, reject) =>
      guardedLookup('example.com', { all: true }, (e, a) => (e ? reject(e) : resolve(a)), answering([{ address: '93.184.216.34', family: 4 }]) as any)
    );
    expect(result).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('refuses when any answer is internal', async () => {
    const error = await new Promise<Error>((resolve) =>
      guardedLookup('example.com', { all: true }, (e) => resolve(e as Error), answering([{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]) as any)
    );
    expect(error).toBeInstanceOf(UnsafeUrlError);
  });
});

describe('readCapped', () => {
  const streamOf = (...chunks: Uint8Array[]) =>
    new Response(new ReadableStream({ start(controller) { chunks.forEach((c) => controller.enqueue(c)); controller.close(); } }));

  it('reads a body under the cap', async () => {
    const bytes = await readCapped(streamOf(new Uint8Array(10), new Uint8Array(5)), 100);
    expect(bytes.byteLength).toBe(15);
  });

  it('stops as soon as the cap is passed, without reading the rest', async () => {
    const response = streamOf(new Uint8Array(60), new Uint8Array(60), new Uint8Array(60));
    await expect(readCapped(response, 100)).rejects.toBeInstanceOf(TooLargeError);
  });

  it('returns an empty buffer for a response with no body', async () => {
    expect((await readCapped(new Response(null, { status: 200 }), 100)).byteLength).toBe(0);
  });
});

/** A local http server on an ephemeral port that counts the requests it actually received. */
const listeningOn = async (handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void) => {
  let requests = 0;
  const server: Server = createServer((req, res) => {
    requests += 1;
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as import('node:net').AddressInfo).port;
  return { port, received: () => requests, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
};

const causeOf = (error: unknown): unknown => (error instanceof TypeError ? error.cause : undefined);

// The tests above inject fetchImpl, so nothing exercises the real undici pieces behind guardedFetch. These do: a real
// Agent wired with guardedLookup exactly as safeFetch.ts wires it, against a local server, with injected resolvers only
// (no internet), so a behaviour change in undici (the connect lookup hook, redirect handling) fails a test here.
describe('the real undici agent behind guardedFetch', () => {
  it('rejects a loopback target at connect time and the server sees no request, while an unguarded fetch reaches the same server', async () => {
    const server = await listeningOn((_req, res) => res.end('reached'));
    const agent = new Agent({ connect: { lookup: guardedLookup as never } });

    const error = await undiciFetch(`http://localhost:${server.port}/`, { dispatcher: agent }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError); // undici wraps the connect failure
    expect(causeOf(error)).toBeInstanceOf(UnsafeUrlError);
    expect(server.received()).toBe(0);

    const control = await undiciFetch(`http://127.0.0.1:${server.port}/`, { dispatcher: new Agent() });
    expect(control.status).toBe(200);
    expect(server.received()).toBe(1);
    await server.close();
  });

  it('rejects DNS rebinding: the pre-check approves a public answer, but the connect-time lookup answers 127.0.0.1', async () => {
    const server = await listeningOn((_req, res) => res.end('reached'));
    const lookupAtConnect = (host: string, opts: object, cb: (e: Error | null, addresses?: unknown) => void) => cb(null, [{ address: '127.0.0.1', family: 4 }]);
    const agent = new Agent({ connect: { lookup: ((hostname, options, callback) => guardedLookup(hostname, options, callback, lookupAtConnect as never)) as never } });
    const fetchImpl = ((url: RequestInfo | URL, init?: RequestInit) => undiciFetch(url as never, { ...(init as object), dispatcher: agent })) as unknown as typeof fetch;
    const lookup = async () => [{ address: '93.184.216.34', family: 4 }]; // the pre-check sees a public address

    const error = await fetchPublic(`http://rebind.example:${server.port}/`, {}, { lookup, fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError); // undici wraps the connect failure
    expect(causeOf(error)).toBeInstanceOf(UnsafeUrlError);
    expect(server.received()).toBe(0);
    await server.close();
  });

  it('returns the 302 with a readable Location through a real agent with redirect: manual, so the per-hop re-check keeps control', async () => {
    const server = await listeningOn((req, res) => {
      if (req.url === '/a.png') {
        res.writeHead(302, { location: '/b.png' });
        res.end();
      } else {
        res.writeHead(200);
        res.end('landed');
      }
    });
    const agent = new Agent();

    const manual = await undiciFetch(`http://127.0.0.1:${server.port}/a.png`, { dispatcher: agent, redirect: 'manual' });
    expect(manual.status).toBe(302);
    expect(manual.headers.get('location')).toBe('/b.png');

    // Without redirect: manual undici follows the hop itself, so the option is what keeps the re-check in control
    const automatic = await undiciFetch(`http://127.0.0.1:${server.port}/a.png`, { dispatcher: agent });
    expect(automatic.status).toBe(200);
    await server.close();
  });
});
