# Decisions

Why the code and the repository are shaped the way they are, so a later session can tell
when a rule stops applying. Newest first. Entries dated 2026-11-20 were recorded from the
files cited (`ex-accell-ui/CLAUDE.md`, `README.md`, the workflows), not decided on that day.

## 2026-11-20: skills live in `.agents/skills/`, `.claude/skills` is a symlink

`pi` and GitHub Copilot discover skills under `.agents/skills/`; Claude Code and the ACMM
"Simple skills" scan look under `.claude/skills`. The symlink (`.claude/skills` to
`../.agents/skills`) serves all of them from one copy. `.gitignore` ignores `.claude/*` and
allowlists the shared files, including the symlink as `!.claude/skills` (no trailing slash: a
trailing slash matches only a directory). Before this, `.claude/` was ignored wholesale, so
none of this could be committed. **Revisit if** a tool stops following the symlink.

## 2026-11-20: `ci` rolls up `test.yml` only

`ci` is the aggregate job in `.github/workflows/test.yml` (needs `build`, `unit-tests`,
`playwright-e2e`). Jupyter, Docs, Demo script, Secret scan and Dependency audit are separate
and path-filtered; a required check on a workflow that does not run for a given PR would block
it. **Revisit when** one of them should gate every PR: then give it an unfiltered trigger and add
it to `needs`.

## `npm run check` is not a gate yet (`.github/workflows/test.yml`)

`svelte-check` has pre-existing errors, so the workflow runs `npm run check || true`. Do not add
new errors; fixing the backlog and removing `|| true` is a separate change. Lint is a gate:
errors fail the job, warnings are tracked by ratchet tests.

## Coverage floor lives in `vitest.config.ts`

`coverage.thresholds` is enforced by the `unit-tests` job through `vitest run --coverage`.
It is a ratchet: raise it, rounded down, when coverage rises, never lower it
(`CONTRIBUTING.md`, "Checks to run before opening a PR").

## PostgreSQL with `pg_duckdb` for all data (`ex-accell-ui/CLAUDE.md`)

The pool requires `pg_duckdb`; plain PostgreSQL does not work. Development and the e2e job use
`pgduckdb/pgduckdb:17-main`. The `*Db.ts` services under `src/lib/services/` are browser-side
clients that call `/api/unified-analytics`; there is no DuckDB file database.

## Missing analytics table is an empty 200, anything else a 500 (`ex-accell-ui/CLAUDE.md`)

A missing table (Postgres `42P01`) returns HTTP 200 with empty data and `meta.unavailable`, so a
fresh database renders empty states. Every other failure is a generic 500 with the detail logged
server-side (`queryErrorResponse`). Never swallow errors into `[]`.

## Data sharing over IPFS is off by default and admin-only (`README.md`)

Anything published is public, stays available only while a node holds a copy and cannot be
withdrawn. It is for open, anonymised data only. Do not change what it exports without a human
decision.

## Deployment is manual (`.github/workflows/deploy.yml`)

`deploy.yml` is `workflow_dispatch` only. Its comment says the `push` trigger is deliberately
removed until the server has `SESSION_SECRET` and an admin bootstrap, and until the `production`
environment has required reviewers. Agents never run it.
