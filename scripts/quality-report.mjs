#!/usr/bin/env node
// Quality report: one page that answers "how healthy is this codebase right now?"
//
// The workflow (.github/workflows/quality-report.yml) runs the real tools and saves their
// output into a directory; this script only reads those files and renders Markdown, so every
// number here comes from a tool, never from the script. A missing input is reported as
// "not available" rather than guessed or shown as zero.
//
// Usage: node scripts/quality-report.mjs --in quality --out quality/quality-report.md
//   web app (ex-accell-ui): web-lint.json (eslint -f json), web-vitest.json (vitest
//     --reporter=json), web-audit-prod.json, web-audit-all.json (npm audit --json),
//     web-coverage-summary.json (vitest json-summary)
//   python: python-junit.xml (pytest --junitxml, Jupyter helpers and ETL tests)
// The Playwright suite needs a database and a browser and is not part of this report. There is
// no Python linter configured in the repository, so none is reported.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function summariseLint(results) {
  if (!Array.isArray(results)) return null;
  let errors = 0;
  let warnings = 0;
  for (const file of results) {
    errors += file.errorCount ?? 0;
    warnings += file.warningCount ?? 0;
  }
  return { files: results.length, errors, warnings };
}

export function summariseNpmAudit(report) {
  const counts = report?.metadata?.vulnerabilities;
  if (!counts) return null;
  return {
    critical: counts.critical ?? 0,
    high: counts.high ?? 0,
    moderate: counts.moderate ?? 0,
    low: counts.low ?? 0,
  };
}

export function summariseVitest(report) {
  if (!report || typeof report.numTotalTests !== "number") return null;
  return {
    suites: report.numTotalTestSuites ?? 0,
    tests: report.numTotalTests,
    passed: report.numPassedTests ?? 0,
    failed: report.numFailedTests ?? 0,
  };
}

/** pytest --junitxml: read the counters off the first <testsuite ...> element. */
export function summarisePytestJunit(xml) {
  if (typeof xml !== "string") return null;
  const tag = xml.match(/<testsuite\b[^>]*>/);
  if (!tag) return null;
  const attr = (name) => {
    const m = tag[0].match(new RegExp(`\\b${name}="(\\d+)"`));
    return m ? Number(m[1]) : 0;
  };
  const tests = attr("tests");
  const failed = attr("failures") + attr("errors");
  const skipped = attr("skipped");
  return { tests, passed: tests - failed - skipped, failed, skipped };
}

export function summariseVitestCoverage(summary) {
  const total = summary?.total;
  if (!total) return null;
  const pct = (key) => (typeof total[key]?.pct === "number" ? total[key].pct : null);
  return { lines: pct("lines"), statements: pct("statements"), functions: pct("functions"), branches: pct("branches") };
}

const na = "not available";
const pct = (value) => (value === null || value === undefined ? na : `${value}%`);
const sev = (a) => `${a.critical} critical, ${a.high} high, ${a.moderate} moderate, ${a.low} low`;

export function renderReport(data, repo, now) {
  const { web, python } = data;
  const lines = [];
  lines.push(`# Quality report: ${repo}`);
  lines.push("");
  lines.push(`Generated ${now.toISOString()} from the tools' own output.`);
  lines.push("");
  lines.push("| Signal | Result |");
  lines.push("| --- | --- |");
  lines.push(`| Web lint (eslint) | ${web.lint ? `${web.lint.errors} errors, ${web.lint.warnings} warnings in ${web.lint.files} files` : na} |`);
  lines.push(
    `| Web unit tests (Vitest) | ${web.tests ? `${web.tests.passed}/${web.tests.tests} passed, ${web.tests.failed} failed, ${web.tests.suites} suites` : na} |`,
  );
  lines.push(`| Web audit (production) | ${web.auditProd ? sev(web.auditProd) : na} |`);
  lines.push(`| Web audit (all, incl. dev) | ${web.auditAll ? sev(web.auditAll) : na} |`);
  lines.push(
    `| Web coverage | ${web.coverage ? `lines ${pct(web.coverage.lines)}, statements ${pct(web.coverage.statements)}, functions ${pct(web.coverage.functions)}, branches ${pct(web.coverage.branches)}` : na} |`,
  );
  lines.push(
    `| Python tests (pytest: Jupyter helpers, ETL) | ${python.tests ? `${python.tests.passed}/${python.tests.tests} passed, ${python.tests.failed} failed, ${python.tests.skipped} skipped` : na} |`,
  );
  lines.push("| Playwright e2e | not part of this report (needs a database and a browser) |");
  lines.push("");
  const gate = [];
  const prod = web.auditProd;
  if (prod && (prod.critical > 0 || prod.high > 0)) gate.push("web production audit has HIGH or CRITICAL advisories");
  if (web.lint && web.lint.errors > 0) gate.push(`${web.lint.errors} eslint errors`);
  if (web.tests && web.tests.failed > 0) gate.push(`${web.tests.failed} failing web tests`);
  if (python.tests && python.tests.failed > 0) gate.push(`${python.tests.failed} failing Python tests`);
  const missing = [
    ["web lint", web.lint],
    ["web tests", web.tests],
    ["web production audit", web.auditProd],
    ["web full audit", web.auditAll],
    ["web coverage", web.coverage],
    ["Python tests", python.tests],
  ]
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  if (gate.length) lines.push(`**Needs attention:** ${gate.join("; ")}.`);
  if (missing.length) lines.push(`**Report incomplete:** unavailable signals: ${missing.join(", ")}.`);
  if (!gate.length && !missing.length) lines.push("**Gate signals:** nothing blocking in what was measured.");
  lines.push("");
  lines.push("`ci` is the real gate; this page is the wider picture. See docs/quality.md for how each number is produced.");
  lines.push("");
  return lines.join("\n");
}

function readText(path) {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readJson(path) {
  const text = readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function loadInputs(dir) {
  return {
    web: {
      lint: summariseLint(readJson(join(dir, "web-lint.json"))),
      tests: summariseVitest(readJson(join(dir, "web-vitest.json"))),
      auditProd: summariseNpmAudit(readJson(join(dir, "web-audit-prod.json"))),
      auditAll: summariseNpmAudit(readJson(join(dir, "web-audit-all.json"))),
      coverage: summariseVitestCoverage(readJson(join(dir, "web-coverage-summary.json"))),
    },
    python: {
      tests: summarisePytestJunit(readText(join(dir, "python-junit.xml"))),
    },
  };
}

export function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const dir = arg("--in", "quality");
  const out = arg("--out", join(dir, "quality-report.md"));
  const repo = process.env.GITHUB_REPOSITORY || "spiculedata/social-explorer";
  const markdown = renderReport(loadInputs(dir), repo, new Date());
  writeFileSync(out, markdown);
  process.stdout.write(markdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
