// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sveltekitOptions } from '../../../sveltekit.options.js';

const csp = sveltekitOptions.csp;
const directives = (csp?.directives ?? {}) as Record<string, string[] | undefined>;

describe('Content-Security-Policy', () => {
  it('is on, with nonces for the framework scripts', () => {
    expect(csp?.mode).toBe('auto');
  });

  it('only runs scripts from this site, never inline or eval', () => {
    expect(directives['script-src']).toEqual(['self']);
    expect(Object.values(directives).flat()).not.toContain('unsafe-eval');
  });

  it('blocks plugins, base tag changes, form posts elsewhere and framing by other sites', () => {
    expect(directives['object-src']).toEqual(['none']);
    expect(directives['base-uri']).toEqual(['self']);
    expect(directives['form-action']).toEqual(['self']);
    expect(directives['frame-ancestors']).toEqual(['self']);
  });

  it('only lets the page call its own server', () => {
    expect(directives['connect-src']).toEqual(['self']);
    expect(directives['default-src']).toEqual(['self']);
  });

  it('allows what the app needs: images and map tiles, fonts, embedded Jupyter, radio audio', () => {
    expect(directives['img-src']).toEqual(expect.arrayContaining(['self', 'data:', 'blob:', 'https:']));
    expect(directives['font-src']).toEqual(expect.arrayContaining(['self', 'data:']));
    expect(directives['media-src']).toEqual(expect.arrayContaining(['self', 'https:']));
  });

  it('frames only the Jupyter server, not every http(s) origin', () => {
    const frameSrc = directives['frame-src'] ?? [];
    expect(frameSrc).toEqual(['self', 'http://localhost:8888']);
    expect(frameSrc).not.toContain('http:');
    expect(frameSrc).not.toContain('https:');
  });
});
