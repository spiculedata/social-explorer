// Guards the secret-scan fix for issue #362: gitleaks' default rules never
// matched an `Authorization: Bearer <value>` header literal (the keyword
// "Authorization" is followed by "ization", so generic-api-key finds no keyword),
// which is how a real third-party token survived every scan in
// etl/download.py. .gitleaks.toml adds a custom rule for that shape; these
// tests verify the rule fails on a fixture of the same shape, that no bearer
// literal is back in the ETL code, and that the historical findings stay
// ignored so the scan can be green.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// Build a synthetic 24-character alphanumeric token at runtime so this source
// file itself is not a finding of the rule it exercises.
const HALF = 'Aa1Bb2Cc3Dd4';
const TOKEN = HALF
  .split('')
  .map((c) => c + c)
  .join('');
assert.equal(TOKEN.length, 24);

function ruleRegex(configText) {
  const match = configText.match(/regex = '''(?<body>[\s\S]*?)'''/);
  assert.ok(match, 'no rule regex found in .gitleaks.toml');
  let body = match.groups.body;
  let flags = 'd';
  if (body.startsWith('(?i)')) {
    flags += 'i';
    body = body.slice(4);
  }
  return new RegExp(body, flags);
}

function loadRule() {
  const config = read('.gitleaks.toml');
  assert.match(config, /\[extend\]/);
  assert.match(config, /useDefault = true/, 'default gitleaks rules must stay enabled');
  const rule = config.match(/id = "(?<id>[^"]+)"/);
  assert.equal(rule.groups.id, 'authorization-bearer-literal');
  return { id: rule.groups.id, regex: ruleRegex(config) };
}

describe('secret-scan rule (issue #362)', () => {
  it('fails on a fixture of the same shape as the leaked Junkipedia token', () => {
    const { id, regex } = loadRule();
    // JSON header literal, as etl/download.py had it
    assert.match(`"Authorization": "Bearer ${TOKEN}"`, regex, 'JSON header literal');
    // single-quoted Python header literal
    assert.match(`'Authorization': 'Bearer ${TOKEN}'`, regex, 'Python header literal');
    // no quotes around the header name, casing variations
    assert.match(`Authorization: Bearer ${TOKEN}`, regex, 'plain header literal');
    assert.match(`"authorization":"bearer ${TOKEN}"`, regex, 'lowercase header literal');
    // same token, no rule id drift
    assert.ok(id, 'rule must have a stable id for .gitleaksignore');
  });

  it('does not flag env-derived or placeholder bearer values', () => {
    const { regex } = loadRule();
    // what download.py does now, and how every other Bearer user builds it
    assert.doesNotMatch('{"Authorization": f"Bearer {token}"}', regex);
    assert.doesNotMatch('authorization: `Bearer ${token}`', regex);
    assert.doesNotMatch('headers={"Authorization": f"Bearer {self.api_key}"}', regex);
    // placeholders are not 20+ alphanumeric characters
    assert.doesNotMatch('"Authorization": "Bearer <token>"', regex);
    assert.doesNotMatch('"Authorization": "Bearer tok"', regex);
    // a long opaque string without an Authorization header is not this rule's shape
    assert.doesNotMatch(`"x-api-key": "${TOKEN}"`, regex);
  });

  it('etl/download.py reads the token from JUNKIPEDIA_TOKEN and holds no literal', () => {
    const source = read('etl/download.py');
    assert.match(source, /os\.environ\.get\("JUNKIPEDIA_TOKEN"\)/);
    assert.match(source, /raise SystemExit/, 'must fail fast with a clear message');
    assert.doesNotMatch(source, /["']Bearer [A-Za-z0-9]/, 'no bearer token literal may return');
  });

  it('.gitleaksignore keeps only the known historical findings ignored', () => {
    const ignored = read('.gitleaksignore')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'));
    assert.deepEqual(
      ignored.map((line) => line.replace(/^.*:/, '')),
      ['14', '80'],
      'unexpected ignore entries',
    );
    for (const line of ignored) {
      assert.match(
        line,
        /^[0-9a-f]{40}:etl\/download\.py:authorization-bearer-literal:(14|80)$/,
        'entries must be fingerprints of the historical Junkipedia findings',
      );
    }
  });
});
