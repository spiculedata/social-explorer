#!/usr/bin/env node
// Acceptance spec for spiculedata/social-explorer#373: "[Security] claude.yml runs with a
// write-scoped app token while the docs say read-only; AI policy docs are stale".
//
// Command specs run in this directory, so the repository root under test is two levels up (the
// base checkout on one side of base-check.yml, the PR checkout on the other). This is a static
// check: it reads the workflow and the policy documents as text and asserts the property the
// issue asked for — the token the model receives is the one the documents describe, and the
// stale statements are gone. No network, no dependencies, no data.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const specDir = dirname(fileURLToPath(import.meta.url));
const root = join(specDir, '..', '..');

const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [acceptance/373/${id}] ${detail}`);
};

const read = (...p) => readFileSync(join(root, ...p), 'utf8');

// C1: the model's token is the job-scoped workflow token, bounded by the permissions block.
try {
  const wf = read('.github', 'workflows', 'claude.yml');

  check('C1', (() => {
    let ok = wf.includes('github_token: ${{ github.token }}');
    // Every one of these reads means the model's token is NOT the workflow's own token.
    const badPermissions = [
      /^\s+id-token:\s*write$/m,
      /^\s+pull-requests:\s*read$/m,
      /^\s+issues:\s*read$/m,
    ];
    for (const re of badPermissions) if (re.test(wf)) ok = false;
    const goodPermissions = [
      /^\s+contents:\s*read$/m,
      /^\s+pull-requests:\s*write$/m,
      /^\s+issues:\s*write$/m,
      /^\s+actions:\s*read$/m,
    ];
    for (const re of goodPermissions) if (!re.test(wf)) ok = false;
    return ok;
  })(), 'claude.yml passes github_token (job-scoped workflow token), keeps contents: read with issues/pull-requests: write and actions: read, and declares no id-token: write');
} catch (e) {
  check('C1', false, `claude.yml unreadable: ${e.message}`);
}

// C2: the docs describe the token the model actually receives, and SECURITY-AI.md section 2
// lists ai-fix.yml as a second path to Anthropic.
try {
  const workflows = read('docs', 'ai-workflows.md');
  const policy = read('docs', 'security', 'SECURITY-AI.md');

  check('C2', (() => {
    let ok = workflows.includes('job-scoped workflow token')
      && workflows.includes('contents: read')
      && !workflows.includes('the token is read-only (`contents: read`), so it cannot push');
    ok = ok && policy.includes('github_token')
      && !policy.includes('read-only content permissions');
    // Section 2's Development and CI table must name ai-fix.yml alongside claude.yml.
    ok = ok && policy.includes('or `ai-fix.yml` runs');
    return ok;
  })(), 'ai-workflows.md and SECURITY-AI.md describe the job-scoped workflow token (contents: read, cannot push) and SECURITY-AI.md section 2 lists ai-fix.yml');

  // C3: the ruleset statements are current, and ai-fix.yml is listed among the CI agents.
  const agents = read('AGENTS.md');
  check('C3', (() => {
    let ok = !policy.includes('No ruleset protects `main`')
      && !policy.includes('nothing on GitHub enforces a pull request')
      && policy.includes('protect main')
      && policy.includes('**`ai-fix.yml`**');
    ok = ok && !agents.includes('There is no ruleset on `main` yet')
      && agents.includes('protect main');
    return ok;
  })(), 'SECURITY-AI.md describes the protect main ruleset and lists ai-fix.yml as a CI agent; AGENTS.md invariant 10 and the merging section state the current ruleset');
} catch (e) {
  check('C2', false, `docs unreadable: ${e.message}`);
  check('C3', false, `docs unreadable: ${e.message}`);
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length === 0 ? '[acceptance/373] pass' : `[acceptance/373] fail (${failed.length} of ${checks.length})`);
process.exit(failed.length === 0 ? 0 : 1);
