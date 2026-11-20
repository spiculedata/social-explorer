import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  loadInputs,
  renderReport,
  summariseLint,
  summariseNpmAudit,
  summarisePytestJunit,
  summariseVitest,
  summariseVitestCoverage,
} from "../quality-report.mjs";

const NOW = new Date("2026-11-20T00:00:00Z");
const empty = {
  web: { lint: null, tests: null, auditProd: null, auditAll: null, coverage: null },
  python: { tests: null },
};
const clean = {
  web: {
    lint: { files: 3, errors: 0, warnings: 5 },
    tests: { suites: 1, tests: 2, passed: 2, failed: 0 },
    auditProd: { critical: 0, high: 0, moderate: 0, low: 0 },
    auditAll: { critical: 0, high: 0, moderate: 0, low: 0 },
    coverage: { lines: 80, statements: 80, functions: 80, branches: 80 },
  },
  python: { tests: { tests: 2, passed: 2, failed: 0, skipped: 0 } },
};

describe("summarise inputs", () => {
  it("sums eslint errors and warnings and rejects a non-array", () => {
    assert.deepEqual(summariseLint([{ errorCount: 1, warningCount: 2 }, { errorCount: 0, warningCount: 3 }]), {
      files: 2,
      errors: 1,
      warnings: 5,
    });
    assert.equal(summariseLint({ not: "an array" }), null);
  });

  it("reads npm audit severities and returns null without metadata", () => {
    assert.deepEqual(summariseNpmAudit({ metadata: { vulnerabilities: { critical: 0, high: 2, moderate: 3, low: 1 } } }), {
      critical: 0,
      high: 2,
      moderate: 3,
      low: 1,
    });
    assert.equal(summariseNpmAudit({}), null);
  });

  it("reads vitest json totals", () => {
    assert.deepEqual(summariseVitest({ numTotalTestSuites: 4, numTotalTests: 10, numPassedTests: 9, numFailedTests: 1 }), {
      suites: 4,
      tests: 10,
      passed: 9,
      failed: 1,
    });
    assert.equal(summariseVitest(null), null);
  });

  it("reads pytest junit counters", () => {
    const xml = '<?xml version="1.0"?><testsuites><testsuite name="pytest" errors="1" failures="2" skipped="1" tests="10" time="0.1">';
    assert.deepEqual(summarisePytestJunit(xml), { tests: 10, passed: 6, failed: 3, skipped: 1 });
    assert.equal(summarisePytestJunit("not xml"), null);
    assert.equal(summarisePytestJunit(null), null);
  });

  it("reads coverage percentages", () => {
    assert.deepEqual(summariseVitestCoverage({ total: { lines: { pct: 81.5 }, branches: { pct: 70 } } }), {
      lines: 81.5,
      statements: null,
      functions: null,
      branches: 70,
    });
    assert.equal(summariseVitestCoverage({}), null);
  });
});

describe("renderReport", () => {
  it('says "not available" for missing inputs instead of showing zeros', () => {
    const md = renderReport(empty, "o/r", NOW);
    assert.ok(md.includes("not available"));
    assert.ok(md.includes("**Report incomplete:**"));
    assert.ok(md.includes("web lint, web tests, web production audit"));
    assert.doesNotMatch(md, /nothing blocking in what was measured/);
    assert.doesNotMatch(md, /0 failed/);
  });

  it("reports a missing signal alongside a measured failure", () => {
    const md = renderReport(
      { web: { ...empty.web, tests: { suites: 1, tests: 2, passed: 1, failed: 1 } }, python: empty.python },
      "o/r",
      NOW,
    );
    assert.ok(md.includes("**Needs attention:** 1 failing web tests."));
    assert.ok(md.includes("**Report incomplete:** unavailable signals: web lint"));
    assert.doesNotMatch(md, /nothing blocking in what was measured/);
  });

  it("keeps the clean summary when all signals are available", () => {
    const md = renderReport(clean, "o/r", NOW);
    assert.ok(md.includes("**Gate signals:** nothing blocking in what was measured."));
    assert.doesNotMatch(md, /Report incomplete/);
  });

  it("flags production advisories, lint errors and failing tests", () => {
    const md = renderReport(
      {
        web: {
          ...clean.web,
          auditProd: { critical: 0, high: 1, moderate: 0, low: 0 },
          lint: { files: 1, errors: 4, warnings: 0 },
          tests: { suites: 1, tests: 3, passed: 2, failed: 1 },
        },
        python: { tests: { tests: 5, passed: 4, failed: 1, skipped: 0 } },
      },
      "o/r",
      NOW,
    );
    assert.ok(md.includes("Needs attention"));
    assert.ok(md.includes("HIGH or CRITICAL"));
    assert.ok(md.includes("4 eslint errors"));
    assert.ok(md.includes("1 failing web tests"));
    assert.ok(md.includes("1 failing Python tests"));
  });

  it("does not count lint warnings as a gate problem", () => {
    assert.doesNotMatch(renderReport(clean, "o/r", NOW), /Needs attention/);
  });
});

describe("loadInputs", () => {
  it("reads the files the workflow writes and tolerates missing or corrupt ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "quality-"));
    writeFileSync(join(dir, "web-vitest.json"), JSON.stringify({ numTotalTests: 3, numPassedTests: 3 }));
    writeFileSync(join(dir, "web-lint.json"), "{ not json");
    const inputs = loadInputs(dir);
    assert.equal(inputs.web.tests.tests, 3);
    assert.equal(inputs.web.lint, null);
    assert.equal(inputs.python.tests, null);
  });
});

describe("quality-report.yml", () => {
  const text = readFileSync(".github/workflows/quality-report.yml", "utf8");

  it("is reporting only: a read-only token and never part of ci", () => {
    assert.match(text, /^permissions:\n {2}contents: read$/m);
    assert.doesNotMatch(text, /contents: write|pull-requests: write|pull_request_target/);
    assert.doesNotMatch(readFileSync(".github/workflows/test.yml", "utf8"), /quality-report/);
  });

  it("writes exactly the file names the script reads", () => {
    for (const name of ["web-lint.json", "web-vitest.json", "web-audit-prod.json", "web-audit-all.json", "web-coverage-summary.json", "python-junit.xml"]) {
      assert.ok(text.includes(name), `${name} is not produced by the workflow`);
    }
  });
});
