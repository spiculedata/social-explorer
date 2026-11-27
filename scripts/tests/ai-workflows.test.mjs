import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const DIR = ".github/workflows";
const CLAUDE_ACTION = "anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc # v1.0.248";
const read = (name) => readFileSync(`${DIR}/${name}`, "utf8");
const code = (text) => text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

describe("ai-fix.yml and auto-review.yml", () => {
  for (const name of ["ai-fix.yml", "auto-review.yml"]) {
    describe(name, () => {
      const text = read(name);

      it("is inert without a secret and checks the label sender's repository permission", () => {
        assert.match(text, /CLAUDE_CODE_OAUTH_TOKEN/);
        assert.match(text, /ANTHROPIC_API_KEY/);
        assert.match(text, /is not configured/);
        assert.match(text, /collaborators\/\$SENDER\/permission/);
        assert.match(text, /admin\|maintain\|write/);
      });

      it("treats hive-style *-bot users as automated senders", () => {
        assert.ok(text.includes('*"[bot]"|*-bot) automated=true'));
      });

      it("pins the Claude action to the reviewed commit and bounds turns and minutes", () => {
        assert.ok(text.includes(CLAUDE_ACTION), "claude-code-action is not pinned to the reviewed SHA");
        assert.match(text, /--max-turns \d+/);
        assert.match(text, /timeout-minutes: \d+/);
      });

      it("uses a tool allowlist and denies force-push, pushes to main and network tools", () => {
        assert.match(text, /--allowedTools/);
        for (const denied of ["git push --force", "git push -f", "git push origin main", "curl", "wget"]) {
          assert.ok(text.includes(`Bash(${denied}`), `${name} does not deny ${denied}`);
        }
        assert.doesNotMatch(text.match(/--allowedTools "[^"]*"/)[0], /Bash\((curl|wget|gh pr merge|gh pr review|rm)/);
      });

      it("keeps the agent out of workflows, agent settings, deployment, auth and migrations", () => {
        const denied = text.match(/--disallowedTools "[^"]*"/)[0];
        for (const path of ["/.github/**", "/.claude/**", "/docs/security/**", "/docker-compose.yml", "/deploy/**", "/ex-accell-ui/db/migrations/**", "/ex-accell-ui/src/lib/server/auth/**"]) {
          assert.ok(denied.includes(`Edit(${path})`), `${name} does not deny edits to ${path}`);
        }
        assert.ok(denied.includes("Read(**/.env)"));
      });

      it("grants write access only on the job, never at the top level", () => {
        assert.match(text, /^permissions: \{\}/m);
        assert.match(text, /^ {6}contents: write/m);
      });

      it("never reaches the deploy or registry secrets", () => {
        assert.doesNotMatch(code(text), /secrets\.(DEPLOY_[A-Z_]+|SCW_[A-Z_]+)/);
      });
    });
  }

  it("ai-fix rejects bots unless AI_FIX_ALLOWED_BOTS lists them, and only reacts to its label", () => {
    const text = read("ai-fix.yml");
    assert.match(text, /vars\.AI_FIX_ALLOWED_BOTS/);
    assert.match(text, /SENDER_TYPE" = "Bot"/);
    assert.match(text, /github\.event\.label\.name == 'ai-fix-requested'/);
    assert.match(text, /^ {2}issues:\n {4}types: \[labeled\]/m);
  });

  describe("ai-fix.yml splits the agent from every write token", () => {
    const text = read("ai-fix.yml");
    const agentJob = text.slice(text.indexOf("  fix:"), text.indexOf("  apply:"));
    const applyJob = text.slice(text.indexOf("  apply:"));

    it("the agent job holds no write-capable permission and no OIDC exchange", () => {
      assert.match(agentJob, /^ {6}contents: read$/m);
      for (const denied of ["contents: write", "pull-requests: write", "issues: write", "id-token: write"]) {
        assert.doesNotMatch(agentJob, new RegExp(`^ {6}${denied.replace(/[-:]/g, "\\$&")}$`, "m"), `the agent job grants ${denied}`);
      }
    });

    it("the agent runs on the default workflow token, so no App token is minted or exported", () => {
      assert.match(agentJob, /github_token: \$\{\{ github\.token \}\}/);
    });

    it("the agent's subprocess environment is scrubbed", () => {
      assert.match(agentJob, /CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'/);
    });

    it("the agent has no push, comment, merge or live-issue tool", () => {
      const allowed = text.match(/--allowedTools "[^"]*"/)[0];
      for (const tool of ["git push", "gh pr create", "gh pr merge", "gh issue comment", "gh issue view"]) {
        assert.ok(!allowed.includes(`Bash(${tool}`), `allowedTools must not contain ${tool}`);
      }
      assert.ok(allowed.includes("Bash(git add"), "the agent still commits locally");
    });

    it("the issue reaches the agent as a snapshot, not a live read", () => {
      assert.match(agentJob, /Snapshot the issue/);
      assert.doesNotMatch(text, /gh issue view \$\{\{/);
    });

    it("dependency manifests, lockfiles, scripts and agent settings are denied to the editor", () => {
      const denied = text.match(/--disallowedTools "[^"]*"/)[0];
      for (const path of ["Edit(**/package.json)", "Edit(**/package-lock.json)", "Edit(/scripts/**)", "Edit(/.agents/**)"]) {
        assert.ok(denied.includes(path), `disallowedTools must contain ${path}`);
      }
    });

    it("only the apply job holds the write token, and its steps are fixed shell, not the agent", () => {
      assert.match(applyJob, /^ {6}contents: write$/m);
      assert.match(applyJob, /^ {6}pull-requests: write$/m);
      assert.match(applyJob, /^ {6}issues: write$/m);
      assert.doesNotMatch(applyJob, /claude-code-action/);
      assert.match(applyJob, /download-artifact/);
      assert.match(applyJob, /git apply --index/);
      assert.match(applyJob, /gh pr create/);
    });

    it("the patch travels through an artifact action pinned to a commit SHA", () => {
      assert.match(text, /actions\/upload-artifact@[0-9a-f]{40} #/);
      assert.match(text, /actions\/download-artifact@[0-9a-f]{40} #/);
    });
  });

  it("ai-fix checks out the default branch only (an issue event, never a pull request head)", () => {
    const text = code(read("ai-fix.yml"));
    assert.doesNotMatch(text, /pull_request/);
    assert.doesNotMatch(text, /ref:\s*\$\{\{/);
  });

  it("auto-review is disabled, skips forks, rejects every bot and removes its label", () => {
    const text = read("auto-review.yml");
    assert.match(code(text), /^ {4}if: \$\{\{ false \}\}$/m);
    assert.match(text, /only a maintainer may start auto-review/);
    assert.match(text, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
    assert.match(text, /--remove-label apply-review/);
  });
});

describe("main-guard.yml", () => {
  it("only reads and files issues; it never writes contents", () => {
    const text = read("main-guard.yml");
    assert.match(text, /issues: write/);
    assert.match(text, /contents: read/);
    assert.doesNotMatch(text, /contents: write/);
  });
});

describe("ci-feedback.yml", () => {
  it("is not part of the ci rollup", () => {
    assert.doesNotMatch(read("test.yml"), /ci-feedback/);
  });
});
