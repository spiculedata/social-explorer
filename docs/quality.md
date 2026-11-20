# Quality report

A weekly page that answers "how healthy is this codebase right now?" in one place. It is the wider
picture; the gate is the `ci` check in [`test.yml`](../.github/workflows/test.yml).

## How it is produced

[`quality-report.yml`](../.github/workflows/quality-report.yml) runs on Mondays (and on demand, and on a
pull request that changes the report itself). It runs the real tools, saves their output into `quality/`,
and [`scripts/quality-report.mjs`](../scripts/quality-report.mjs) renders it. The script computes nothing
itself: every number comes from a tool, and a tool that produced no output shows as "not available", never
as zero.

| Signal | Tool and command | Input file |
| --- | --- | --- |
| Web lint | `npx eslint . -f json` in `ex-accell-ui/` | `web-lint.json` |
| Web unit tests | `npx vitest run --reporter=json` | `web-vitest.json` |
| Web coverage | the same run with `--coverage.reporter=json-summary` | `web-coverage-summary.json` |
| Web audit, production and all | `npm audit --omit=dev --json`, `npm audit --json` | `web-audit-prod.json`, `web-audit-all.json` |
| Python tests | `pytest` over `jupyter/tests` and `etl/test_safe_http.py` | `python-junit.xml` |

Not covered: the Playwright suite (needs PostgreSQL with `pg_duckdb` and a browser), `wavepulse/` (it has
no tests), the Jupyter image build, and `npm run check`. There is no Python linter configured in the
repository, so none is reported.

## What it does with the result

It publishes the page as the job summary and as the `quality-report` artifact (90 days). It never commits
or pushes, the token is read-only, no secrets are used, and nothing depends on it.

## Related reports

- [`pr-metrics.yml`](../.github/workflows/pr-metrics.yml): merge rate and time to merge over 90 days, as an
  artifact (`scripts/pr-metrics.mjs`).
- [`nightly-compliance.yml`](../.github/workflows/nightly-compliance.yml): runs the same checks as `ci` on
  `main` every night and files an issue if they fail.
- [`coverage-gate.yml`](../.github/workflows/coverage-gate.yml): see below.
- [`auto-qa.yml`](../.github/workflows/auto-qa.yml): proposes new advisory CI thresholds from recent runs in
  `.github/auto-qa-tuning.json`, by pull request.

## Coverage gate

`.coverage-thresholds.json` is a ratchet set a few points below the coverage measured on 2026-11-20 for
`src/lib` and `src/routes/api` (the files `vitest.config.ts` includes). `coverage-gate.yml` fails when a
metric drops below it. It is separate from, and stricter than, the floor in `ex-accell-ui/vitest.config.ts`
that the `unit-tests` job in `test.yml` already enforces (59/58/70/57 at the time of writing, well below what
is measured today). Raise a number when coverage rises; never lower one. The coverage gate is advisory: `ci`
does not depend on it, and its job does not run on pushes to `main` that only touch documentation.

| Metric | Measured 2026-11-20 | `.coverage-thresholds.json` |
| --- | --- | --- |
| Statements | 78.09% | 75 |
| Branches | 73.0% | 70 |
| Functions | 80.9% | 77 |
| Lines | 77.23% | 74 |
