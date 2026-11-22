import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// SvelteKit 3 deprecated the `$lib` alias. Code imports from `#lib/...` (package.json `imports`), which needs the real file
// extension (`.ts`, `.js` or `.svelte`). This guard fails on any `$lib` specifier, so the alias cannot creep back in. It scans
// the whole app tree (minus build output and dependencies) and it matches the quoted specifier, so static imports,
// `export ... from`, dynamic `import()`, `vi.mock`, `vi.importActual` and CSS `@import url(...)` are all covered.

const TEXT_FILE = /\.(svelte|[cm]?[jt]sx?|css|html)$/;
// Build output and dependencies, only at the top of the app. A `build` directory inside `src` is still scanned.
const SKIP_TOP_LEVEL = new Set(['node_modules', 'build', 'coverage', 'test-results', 'playwright-report']);
// This file names the alias in its own comments, so only its comment-free code is scanned.
const SELF = 'src/lib/utils/noLibAlias.test.ts';
const withoutComments = (source: string) =>
  source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
// Built from parts so this file does not contain the specifier it forbids.
const LIB_SPECIFIER = new RegExp('[\'"`(]\\' + '$' + 'lib(?:/|[\'"`)])');

function walk(dir: string, top: boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.') || (top && SKIP_TOP_LEVEL.has(name))) return [];
    const path = dir === '.' ? name : join(dir, name);
    return statSync(path).isDirectory() ? walk(path, false) : [path];
  });
}

const files = walk('.', true)
  .map((path) => path.split(sep).join('/'))
  .filter((path) => TEXT_FILE.test(path));
const sourceOf = (path: string) => {
  const source = readFileSync(path, 'utf8');
  return path === SELF ? withoutComments(source) : source;
};

describe('no $lib alias', () => {
  it('scans a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('has no file that imports from the deprecated alias', () => {
    const offenders = files.filter((path) => LIB_SPECIFIER.test(sourceOf(path)));
    expect(offenders, 'Import from #lib/<path>.ts (or .js / .svelte) instead of the deprecated alias').toEqual([]);
  });

  it('keeps the #lib subpath import in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.imports).toEqual({ '#lib/*': './src/lib/*' });
  });
});
