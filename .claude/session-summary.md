# Session summary

Where the work stands, rewritten by whoever last worked on it. Durable knowledge lives in
`AGENTS.md` (invariants), `corrections.jsonl` (lessons) and `.claude/memory/decisions.md` (why).
Rewritten, never appended; delete a line when it stops being true.

_Last updated: 2026-11-20_

## Where we are

- Adopting the ACMM Level 4 layer from `spiculedata/inertia` as a series of pull requests:
  `ci` aggregate check and agent instructions; agent safety settings and AI policy (this one);
  risk tiers and labeler; quality and coverage workflows; agent and gate workflows;
  acceptance-spec wiring.
- `.claude/` used to be ignored wholesale. This layer commits `settings.json`, `memory/`,
  `session-summary.md` and the `skills` symlink.

## Decisions pending

- When `npm run check` (svelte-check) can become a blocking step.
- Whether Jupyter and the other path-filtered workflows should join the `ci` rollup.

## Unverified

- The Playwright e2e suite, the production build and `npm run check` were not run locally for this
  layer; only lint, unit tests with coverage and the two Python suites were.
- No ruleset on `main` was observed when this was written (`gh api repos/spiculedata/social-explorer/rules/branches/main` returned `[]`).

## Next

1. Merge the pull requests in order.
2. Create the `main` ruleset requiring `ci` (a maintainer task).
