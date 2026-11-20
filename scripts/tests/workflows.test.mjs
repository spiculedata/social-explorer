import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const DIR = ".github/workflows";
// These workflows predate the ACMM onboarding and are deliberately left as they were. The
// properties below describe the workflows added by the onboarding pull requests, so a legacy
// workflow without a top-level permissions block does not fail them. (claude.yml and
// claude-code-review.yml set permissions per job; test.yml sets them per job too.)
const LEGACY = new Set([
  "audit.yml",
  "claude-code-review.yml",
  "claude.yml",
  "demo-script.yml",
  "deploy.yml",
  "docs.yml",
  "jupyter.yml",
  "secret-scan.yml",
  "test.yml",
  "wiki.yml",
]);
const FULL_SHA = /@[0-9a-f]{40}$/;
const read = (name) => readFileSync(`${DIR}/${name}`, "utf8");
const code = (text) => text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const allFiles = readdirSync(DIR).filter((f) => f.endsWith(".yml"));
const addedFiles = allFiles.filter((f) => !LEGACY.has(f));

describe("workflows added by the ACMM onboarding", () => {
  it("pin every third-party action to a full commit SHA with a version comment", () => {
    for (const file of addedFiles) {
      for (const line of read(file).split("\n")) {
        const match = line.match(/^\s*-?\s*uses:\s*(\S+)(.*)$/);
        if (!match || match[1].startsWith("./")) continue;
        assert.match(match[1], FULL_SHA, `${file}: ${match[1]} is not pinned to a SHA`);
        assert.match(match[2], /#\s*v\d/, `${file}: ${match[1]} has no version comment`);
      }
    }
  });

  it("declare top-level permissions so the default token is never implicit", () => {
    for (const file of addedFiles) {
      assert.match(read(file), /^permissions:/m, `${file} has no top-level permissions`);
    }
  });

  it("never use pull_request_target", () => {
    for (const file of addedFiles) {
      assert.doesNotMatch(code(read(file)), /pull_request_target/, file);
    }
  });

  it("never interpolate untrusted PR or issue text into a run step", () => {
    for (const file of addedFiles) {
      const runBlocks = code(read(file)).match(/run:[\s\S]*?(?=\n\s{0,8}-\s|\n\s{2,6}\w+:\s|$)/g) ?? [];
      for (const block of runBlocks) {
        assert.doesNotMatch(
          block,
          /\$\{\{\s*github\.event\.(issue|pull_request|comment|review)\.(title|body)/,
          `${file} interpolates PR/issue text into a script`,
        );
      }
    }
  });

  it("never reference the deploy or registry secrets", () => {
    for (const file of addedFiles) {
      assert.doesNotMatch(code(read(file)), /secrets\.(DEPLOY_[A-Z_]+|SCW_[A-Z_]+)/, `${file} reaches a deploy or registry secret`);
    }
  });
});

describe("test.yml ci rollup", () => {
  const text = read("test.yml");
  const block = text.match(/^ {2}ci:\n[\s\S]*$/m)?.[0] ?? "";

  it("has an aggregate job literally named ci that always runs", () => {
    assert.match(block, /^ {2}ci:\n {4}name: ci\n/);
    assert.match(block, /^ {4}if: always\(\)$/m);
  });

  it("needs every job of the workflow that is not itself the rollup", () => {
    const jobs = [...text.matchAll(/^ {2}([a-z][\w-]*):\n {4}name:/gm)].map((m) => m[1]).filter((j) => j !== "ci");
    const needs = block.match(/needs: \[([^\]]+)\]/)?.[1].split(",").map((s) => s.trim()) ?? [];
    assert.deepEqual([...needs].sort(), [...jobs].sort());
  });

  it("fails on anything but success, including skipped and cancelled", () => {
    assert.match(block, /!= "success"|= "success"/);
    assert.doesNotMatch(block, /skipped\)/);
  });

  it("keeps the original jobs and their names", () => {
    for (const name of ["Build & Type Check", "Unit Tests (Vitest)", "E2E Tests (Playwright)"]) {
      assert.ok(text.includes(`name: ${name}`), `${name} is gone`);
    }
  });

  it("does not wire the advisory classifier into ci", () => {
    assert.doesNotMatch(text, /tier-classifier/);
  });
});
