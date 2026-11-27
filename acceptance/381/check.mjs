#!/usr/bin/env node
/**
 * Acceptance check for issue 381: the image moderation review must not take the reviewer or the
 * review status from the request body, because a body-sourced `reviewed_by` lets anyone forge the
 * audit trail.
 *
 * Runs the image-processing route unit tests (reviewer comes from the session user, an unknown
 * `review_status` is refused with 400), then scans the app source (never the tests) for a
 * `reviewed_by` still read out of the request body. Red on the base branch (the route destructures
 * `reviewed_by` from the body and stores it verbatim), green on the fixed head.
 *
 * Synthetic data only: the reviewer addresses in the tests are `example.test` placeholders.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const ui = join(repo, 'ex-accell-ui');
const route = join(ui, 'src/routes/api/image-processing/+server.ts');

const testFile = 'src/routes/api/image-processing/server.test.ts';

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

// The acceptance callers build and start nothing else, so install the web app's dependencies when missing.
if (!existsSync(join(ui, 'node_modules', 'vitest'))) {
  const install = run('npm', ['--prefix', ui, 'ci', '--no-audit', '--no-fund'], repo);
  if (install.status !== 0) {
    console.error('npm ci failed');
    process.exit(install.status ?? 1);
  }
}

// C1 (a body reviewed_by is ignored; the stored reviewer is the session user)
// and C2 (an unknown review_status gets 400).
const vitest = run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', testFile], ui);
if (vitest.status !== 0) {
  console.error('the image-processing route tests failed');
  process.exit(vitest.status ?? 1);
}

// C1, structural half: the route must not read `reviewed_by` out of the request body.
const source = readFileSync(route, 'utf8');
if (/[{][^}]*\breviewed_by\b[^}]*[}][^;=]*=[^;]*\bbody\b/.test(source)) {
  console.error('the route still destructures reviewed_by from the request body');
  process.exit(1);
}

console.log('image moderation review: reviewer is the session user and review_status is allow-listed');
