import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// SvelteKit 3 deprecated the `$lib` alias. Code imports from `#lib/...` (package.json `imports`), which needs the real file
// extension (`.ts`, `.js` or `.svelte`). This guard fails on any `$lib` specifier, so the alias cannot creep back in. It scans
// source, unit tests, e2e tests, scripts and the root config files, and it matches the quoted specifier, so static imports,
// `export ... from`, dynamic `import()`, `vi.mock`, `vi.importActual` and CSS `@import url(...)` are all covered.

const ROOTS = ['src', 'tests', 'scripts'];
const TEXT_FILE = /\.(svelte|ts|js|mjs|cjs|css)$/;
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'build', 'coverage']);
// This file names the alias in its own comments, so it is not scanned.
const SELF = 'src/lib/utils/noLibAlias.test.ts';
// Built from parts so this file does not contain the specifier it forbids.
const LIB_SPECIFIER = new RegExp('[\'"`(]\\' + '$' + 'lib(?:/|[\'"`)])');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const rootConfigs = readdirSync('.').filter((name) => /\.(ts|js|mjs|cjs)$/.test(name));
const files = [...rootConfigs, ...ROOTS.flatMap((root) => walk(root))]
  .map((path) => path.split(sep).join('/'))
  .filter((path) => TEXT_FILE.test(path) && path !== SELF);

describe('no $lib alias', () => {
  it('scans a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('has no file that imports from the deprecated alias', () => {
    const offenders = files.filter((path) => LIB_SPECIFIER.test(readFileSync(path, 'utf8')));
    expect(offenders, 'Import from #lib/<path>.ts (or .js / .svelte) instead of the deprecated alias').toEqual([]);
  });

  it('keeps the #lib subpath import in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.imports).toEqual({ '#lib/*': './src/lib/*' });
  });
});
