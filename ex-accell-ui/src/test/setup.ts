import '@testing-library/jest-dom/vitest';
import { vi, beforeEach } from 'vitest';

// Node 25+ ships its own Web Storage globals. Without --localstorage-file its `localStorage`
// getter returns undefined and shadows jsdom's, so restore the jsdom implementations.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (typeof globalThis[name] === 'undefined' && jsdomWindow) {
    Object.defineProperty(globalThis, name, {
      value: jsdomWindow[name],
      configurable: true,
      writable: true
    });
  }
}

// Reset fetch mock between tests
beforeEach(() => {
  vi.restoreAllMocks();
});
