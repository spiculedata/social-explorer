# Risk tiers

What each change to Social Explorer demands, decided once instead of argued per pull request. The rule is
[`.github/risk-tiers.yml`](../.github/risk-tiers.yml); it is applied by
[`scripts/classify-change.mjs`](../scripts/classify-change.mjs), which
[`.github/workflows/tier-classifier.yml`](../.github/workflows/tier-classifier.yml) runs on every pull
request. This page is the reasoning, the YAML is the rule.

## What a tier is

A tier is a claim about how bad a mistake would be, not how hard the change is. A 400-line refactor of a
Svelte page is `standard` at worst. A two-line change to the access guard or to `deploy.yml` is `critical`.
The classifier labels the pull request (`risk/<tier>`) and keeps one comment up to date naming the tier,
the review it asks for and the files that set it. **It is advisory.** It is not a required check and
cannot block a merge; the check that should be green is `ci`.

## The tiers

| Tier | Label | Covers | Review |
| --- | --- | --- | --- |
| `critical` | `risk/critical` | Workflows (including `deploy.yml`), the access guard, sessions and passwords (`src/lib/server/auth/`, `hooks.server.ts`), schema migrations and their runner, IPFS data sharing, `docker-compose.yml`, `deploy/`, Dapr components, `.env.example` and the secrets template, agent settings and instructions, the security policy | A named human, with the PR body saying what was checked and how, and what was not run. |
| `high` | `risk/high` | API routes, server-only and service code, `etl/`, `wavepulse/`, `jupyter/`, `scripts/`, dependency manifests and lockfiles, Dockerfiles | A human reads the diff and checks queries, validation and error handling; the PR body names the manual check the tests cannot do. |
| `standard` | `risk/standard` | The rest of the web app (pages, components, tests, config), the docs site code, notebooks | Normal review, relevant checks green. |
| `low` | `risk/low` | `docs/**`, markdown, issue and PR templates, repo metadata | A skim: is the prose still true? |

A pull request takes the highest tier any one file matched, so forty doc files do not dilute one change to
the access guard. Files that match nothing take `default_tier` (`standard`), which is a real tier with a
real review requirement.

## Why these paths are critical

Social Explorer stores collected posts and user accounts, runs notebook and workflow code for admins, and
can deploy to a production server, so the critical tier is about access, irreversibility and gates:

- **Authentication and access control** (`hooks.server.ts`, `src/lib/server/auth/`): they decide who can
  read data and who can run code. A wrong answer is unauthenticated or cross-role access.
- **Schema migrations** (`db/migrations/`, the runner): applied once each to real databases and not
  repairable by re-running.
- **Data sharing** (`src/lib/server/dataSharing/`, the `data-sharing` routes): published datasets are
  public and cannot be withdrawn.
- **Deployment and the stack** (`deploy.yml`, `docker-compose.yml`, `deploy/`, Dapr components): they
  reach production secrets, published ports and the state store.
- **Secrets files** (`.env.example`, `secrets.example.json`): a pasted real value is a leaked credential.
- **Gates** (`.github/workflows/**`, `.claude/settings.json`, the instruction files, the policy, the
  coverage thresholds): they decide what the next change may skip.

Patterns for files that arrive in sibling onboarding pull requests (`.claude/settings.json`,
`docs/security/`, `.coverage-thresholds.json`, `.github/auto-qa-tuning.json`, `.github/labeler.yml`) are
marked `pending: true` in the YAML so the dead-pattern test passes on every branch. Remove the flag once the
file is on `main`.

## Input is paths, nothing else

The classifier reads the list of changed file paths from the API. It never reads the pull request title,
body, branch name or comments, and never calls a model. Same files, same answer; there is nothing in it
to prompt-inject. Patterns are globs: `*` stops at a slash, `**` does not.

## Changing a tier

Edit `.github/risk-tiers.yml` and run `node --test "scripts/tests/*.test.mjs"` from the repository root.
The tests fail if a tier loses its summary or review text, if two tiers share a label, or if a listed
pattern matches no file in the repository (a renamed file would otherwise be silently downgraded to the
default tier).

## Labels

`risk/critical`, `risk/high`, `risk/standard` and `risk/low` already exist on the repository. The workflow
also tries to create or refresh them and carries on if it is not permitted to. Path labels
(`documentation`, `dependencies`, `github_actions`, `docker`, `javascript`, `python`, `database`, `tests`)
come from [`.github/labeler.yml`](../.github/labeler.yml) through `labeler.yml`; both workflows are
advisory and run on `pull_request` only. `labeler.yml` skips pull requests from forks (their read-only
token cannot label anyway), so a fork's read-only token never turns a pull request red.
