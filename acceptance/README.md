# Acceptance specs

`acceptance/<issue>/spec.json` is the executable form of an issue's acceptance criteria. The
convention, the checks and the spec format come from the shared repository
[`spiculedata/acceptance-spec`](https://github.com/spiculedata/acceptance-spec) (public); this page
says how Social Explorer uses it. Read that repository's `docs/spec-format.md` before writing a spec.

## The rules

- **One directory per issue**, named by the issue number, holding `spec.json` and any script it runs:
  `acceptance/<issue>/spec.json`. The `issue` field equals the directory name. Files in `acceptance/`
  that are not numbered directories (this README) are ignored by the checks.
- **Spec first.** A pull request that closes issue N (with a closing keyword in its body, for example
  `Closes #N`) and N is at or above the cutoff owes `acceptance/N/spec.json`. The spec must **fail on the
  base branch and pass on the pull request's head**. A spec written after the fact passes both and proves
  nothing.
- **Criteria come from the issue.** Each entry in `criteria` is one acceptance criterion of the issue (the
  "Acceptance criteria" field of the issue forms, or its checklist). If the issue is vague, fix the issue,
  not the spec.
- **`not-run` is never a pass.**
- **Two labels, both applied by a human and never by an agent:** `acceptance-waived` (a docs-only or
  tests-only pull request owes no spec; the person applying it says why in a comment) and
  `spec-already-green` (a spec legitimately passes on base). Both labels exist on the repository.

## Command specs only (for now)

The callers in [`.github/workflows/acceptance.yml`](../.github/workflows/acceptance.yml) build and start
nothing, so only `"kind": "command"` specs run: an argv whose exit code is the verdict. An `api` spec
would be recorded `not-run`. Running the web app needs PostgreSQL with `pg_duckdb` and a build, which
the shared workflows do not set up here; that is a separate decision (see "Open questions" in the pull
request that added this).

A spec that needs the web app's dependencies installs them in its own command and runs from the
repository root, for example:

```json
{
  "issue": 123,
  "title": "the demo generator never emits an empty post body",
  "kind": "command",
  "criteria": [
    { "id": "C1", "given": "the synthetic demo dataset is generated", "then": "no generated post has an empty body" }
  ],
  "command": ["node", "acceptance/123/check.mjs"],
  "timeoutSeconds": 300
}
```

`acceptance/123/check.mjs` may call `npm --prefix ex-accell-ui ci` and then run one Vitest file with
`npx --prefix ex-accell-ui vitest run <file>`. Specs use synthetic data only: never real posts, handles,
transcripts or user data (`AGENTS.md`, invariant 1).

## Where it is wired

| File | Role | Mode |
| --- | --- | --- |
| [`acceptance.yml`](../.github/workflows/acceptance.yml) | `convention`, `run-specs` and `base-check` callers, `pull_request` only | **report**: findings are warnings, nothing blocks |
| [`thin-caller-gate.yml`](../.github/workflows/thin-caller-gate.yml) | Static drift check of the wiring | report |
| [`acceptance-pin-health.yml`](../.github/workflows/acceptance-pin-health.yml) | Weekly: how far behind the pin is (summary only, opens no issue) | report |

None of them is part of `ci`. The cutoff in `acceptance.yml` (`enforce-from-issue: "303"`) is the latest
issue or pull request number when this was added (302) plus one: every older issue is exempt and only
newer ones owe a spec.

## One pin

Every `uses: spiculedata/acceptance-spec/...` line carries the same full commit SHA, currently
`e1ee02261986f510ca3be97f09b07546dd0614be` (the SHA `spiculedata/inertia` pins). Change them together; `thin-caller-gate` reports
drift and `scripts/tests/acceptance-wiring.test.mjs` fails on an unpinned reference. Bumping the pin is a
human decision: read what changed in `acceptance-spec` first.

## Moving from report to enforce

After a few pull requests have shown that the callers behave: set `mode: enforce` on the three callers,
add them to the `needs` of the `ci` job in `test.yml` together with a step that reads their
verdict outputs (inertia's `ci.yml` has the pattern, and a test that runs the step), and only then ask the
`main` ruleset to rely on `ci`. That is a separate, reviewed change.
