# AI workflows

Two GitHub Actions workflows in the onboarding layer let an AI agent act on this repository when a
maintainer asks it to, and two older ones answer comments and review pull requests. The policy they sit
under is [`docs/security/SECURITY-AI.md`](security/SECURITY-AI.md).

| Workflow | Trigger | What it does | Status |
| --- | --- | --- | --- |
| `ai-fix.yml` | A user with write access adds the **`ai-fix-requested`** label to an issue | Attempts the fix on a new `ai-fix/...` branch and opens a pull request that says `Fixes #N` | **Live as soon as it merges**: the `ANTHROPIC_API_KEY` secret already exists |
| `auto-review.yml` | **Disabled.** Was: a maintainer adds **`apply-review`** to a same-repository pull request | Applied the changes reviewers asked for as a new commit on that PR's branch | Disabled (`if: ${{ false }}`) because it ran PR-controlled install scripts with write credentials |
| `claude.yml` (existing) | `@claude` in an issue, comment, review or new issue, by an OWNER, MEMBER or COLLABORATOR | Answers in the thread; the token is the job-scoped workflow token with `contents: read`, so it cannot push (`issues` and `pull-requests: write` exist only so it can post its answer, `actions: read` so it can read CI results) | Live, untouched |

## Overlap between the existing workflows and the new ones

- **`claude.yml` vs `ai-fix.yml`.** Same action and same secret, different jobs. `claude.yml` is
  interactive and cannot push (`contents: read`): a maintainer asks a question or for a review and
  gets a comment. `ai-fix.yml`
  is the autonomous writer: label-gated, write token, tool allowlist, one branch, one pull request. They do
  not conflict. The one thing to watch is that an issue containing `@claude` from a maintainer starts
  `claude.yml` on `opened`, and the same issue labelled `ai-fix-requested` starts `ai-fix.yml`; they can run
  side by side.
- **`claude-code-review.yml` (removed).** It failed on 29 of its last 30 runs, added a red check to most pull requests and spent API credit on every push, so it was deleted.
- **Recommendation.** Keep `claude.yml` as it is. Keep `ai-fix.yml` (with `AI_FIX_ALLOWED_BOTS` empty, see
  below). Leave `auto-review.yml` disabled until it is redesigned.

## What keeps `ai-fix.yml` bounded

- **Only people with write access start it.** The label must be added by a user with write access (checked
  with the collaborator-permission API). A bot can start it only if its login is listed in the
  `AI_FIX_ALLOWED_BOTS` repository variable (a space-separated list, empty or unset by default). Any login
  ending in `-bot` or `[bot]` counts as a bot, so the hive's `spicule-hive-bot` is deliberately not
  admitted: hive-created issues carry `ai-fix-requested`, and without this default each would start a paid
  agent run on its own. Add the bot to the variable only if you want that.
- **Public repository, untrusted text.** Issues can be filed by anyone. The prompt tells the agent that the
  issue is data, not instructions, and not to open attachments or copy collected content into files.
  Only a maintainer's label starts a run, so an anonymous issue cannot.
- **Tools are an allowlist**: edit files, the repository's check commands (web lint, unit tests, build,
  type check, the Jupyter and ETL pytest suites, the Node script tests), `git add/commit`, pushing its own
  `ai-fix/*` branch, and opening a PR or comment. No curl, no arbitrary shell, force-pushes and pushes to
  `main` denied, `gh pr merge` and `gh pr review` not allowed.
- **Scope limits.** A deny list keeps the agent out of `.github/`, `.claude/`, `docs/security/`,
  `AGENTS.md`, `CLAUDE.md`, `SECURITY.md`, `docker-compose.yml`, `deploy/`, the migrations, the access
  guard and sessions (`hooks.server.ts`, `src/lib/server/auth/`) and data sharing; the prompt tells it to
  comment for a human instead. `.github/risk-tiers.yml` classifies any such change as `critical` if it
  happens anyway. The deny patterns are defence in depth that has not been observed to be enforced by the
  action.
- **Bounded runs.** 30 turns and 30 minutes, one run per issue at a time.
- **No deploy secrets.** The job references `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` only
  (a test fails if any workflow added by the onboarding references `DEPLOY_*` or `SCW_*`).
- **No fork exposure.** It triggers on `issues: labeled`, not on pull requests, and never uses
  `pull_request_target`. A fork pull request cannot start it.
- **Pinned.** `anthropics/claude-code-action` is pinned to commit
  `1d6de8cb0c237e7c15e9e1bdf973826ebae490cc` (v1.0.248); every other action is pinned to a commit SHA too.
- **A human still decides.** Everything arrives as a pull request; `ci` must pass and a reviewer must merge.

## Things to know before relying on it

- It sends repository source and issue text to Anthropic. The repository is public, so the source is not
  secret, but the issue text of a real incident may be; the owner should be comfortable with that.
- A pull request opened with the default token does not start its own `pull_request` workflows by itself (GitHub
  holds them as `action_required`); a maintainer starts CI on those. Nothing approves runs.
- The agent steps have not run here: the workflow's YAML and gating logic were checked, and the label and
  secret conditions read, but nothing was exercised on GitHub.
- The agent can be wrong. The label saves typing, not review.

## The other gates in this PR

- `issue-gate.yml`: removes `issue-approved` from an issue that has no "Acceptance criteria" heading and no
  task-list item, and says why. It reads the issue body through an environment variable only, uses no
  checkout and no third-party action, and has `issues: write` on the job only. The issue forms carry an
  `Acceptance criteria` field for this.
- `main-guard.yml`: opens an issue when a commit reaches `main` with no linked pull request. Detection only.
- `ci-feedback.yml`: when a watched workflow (Tests, Jupyter, Docs, Demo script, Dependency audit, Coverage
  gate) fails on a same-repository pull request, posts one comment with the failing jobs and the first error
  lines of each, and edits it to say so when the checks pass. `workflow_run`, so it runs the default
  branch's copy and never checks out the pull request; fork pull requests are skipped; its token is
  `actions: read`, `contents: read`, `pull-requests: write`. `Secret scan` is not watched.

## Turning them off

Deleting the `ANTHROPIC_API_KEY` secret would also stop `claude.yml`, so to stop
only `ai-fix` delete `.github/workflows/ai-fix.yml`. To stop everything AI, delete the secret.
