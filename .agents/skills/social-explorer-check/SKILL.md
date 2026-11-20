---
name: social-explorer-check
description: Run Social Explorer's pre-PR gate for the parts of the repo a change touched (web app lint, unit tests with coverage, build, svelte-check; Jupyter and ETL Python tests; docs site) and report what actually ran. Use before opening or updating a pull request, or when asked whether a change is done.
---

# social-explorer-check

Run from the repo root. Report real output; do not summarise a step you did not run. Only run
the sections for the parts you changed, and say which you skipped and why.

## Web app (`ex-accell-ui/`)

These mirror the jobs behind the `ci` check in `.github/workflows/test.yml`.

1. `cd ex-accell-ui && npm ci` if `node_modules/` is missing or `package-lock.json` changed.
2. `npm run lint`. Errors fail CI; warnings are tracked by ratchet tests, so do not add new ones.
3. `npm run check` (svelte-check). It has pre-existing errors and CI runs it with `|| true`:
   compare the error count before and after your change and report both; add none.
4. `npm run test:unit:coverage`. It fails below the floor in `vitest.config.ts`. If your tests
   raised coverage, raise the floor (rounded down) in the same change; never lower it.
5. `npm run build`.
6. `npm run test:e2e` needs PostgreSQL with `pg_duckdb` on `DATABASE_URL`
   (`pgduckdb/pgduckdb:17-main`) and `npx playwright install chromium`. If you have no database,
   say you did not run it; CI's `playwright-e2e` job will.

## Python

- Jupyter helpers: `cd jupyter && python -m pytest -q` (what `jupyter.yml` runs).
- ETL: `cd etl && python -m pytest test_safe_http.py`. No workflow runs the ETL tests, so a green
  CI says nothing about them.
- `wavepulse/` has no tests. Say so rather than implying coverage.

## Docs site (`docs-site/`)

`cd docs-site && npm ci && npm run docs:build && npm run wiki:test`.

## Never as part of a check

`docker compose up`, `npm run dapr:*`, `ex-accell-ui/scripts/setup-deployment.sh`,
`npm run demo` or `seed:demo` against a database you do not own, and anything in `deploy.yml`.

The CI check that matters is the aggregate job `ci`. A green local run is the floor, not the
proof: say what you ran and what you did not (the e2e suite, the Jupyter image, a deployment).
