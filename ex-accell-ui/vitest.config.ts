import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltekitOptions } from './sveltekit.options.js';

export default defineConfig({
  plugins: [sveltekit(sveltekitOptions)],
  // Render Svelte components with the browser build so component tests can mount them
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['tests/**', 'node_modules/**'],
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/routes/api/**'],
      // Vitest 5 counts snapshot files (*.snap) as uncovered source, so leave them out
      exclude: ['src/lib/services/types/**', 'src/lib/components/**/*.svelte', '**/__snapshots__/**'],
      // Floor measured on 2026-11-26 (stmts 78.25, branches 73.18, funcs 81.15, lines 77.51).
      // `npm run test:unit:coverage` fails if any metric drops below it. Raise it when you add tests.
      thresholds: { statements: 78, branches: 73, functions: 81, lines: 77 }
    }
  }
});
