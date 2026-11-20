import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { evaluate, main, renderTable } from "../check-coverage.mjs";

const thresholds = { thresholds: { web: { statements: 60, branches: 60, functions: 50, lines: 60 } } };
const summary = (n) => ({ total: Object.fromEntries(["statements", "branches", "functions", "lines"].map((k) => [k, { pct: n }])) });

describe(".coverage-thresholds.json", () => {
  const committed = JSON.parse(readFileSync(".coverage-thresholds.json", "utf8"));

  it("has a rationale and a threshold for every web metric", () => {
    assert.ok(committed.rationale.length > 50);
    assert.deepEqual(Object.keys(committed.thresholds.web).sort(), ["branches", "functions", "lines", "statements"]);
    for (const value of Object.values(committed.thresholds.web)) assert.equal(typeof value, "number");
  });

  it("is at or above the floor vitest.config.ts already enforces, so it never loosens it", () => {
    const config = readFileSync("ex-accell-ui/vitest.config.ts", "utf8");
    const floor = config.match(/thresholds:\s*\{([^}]*)\}/)?.[1] ?? "";
    for (const metric of ["statements", "branches", "functions", "lines"]) {
      const configured = Number(floor.match(new RegExp(`${metric}:\\s*(\\d+(?:\\.\\d+)?)`))?.[1]);
      assert.ok(Number.isFinite(configured), `${metric} floor not found in vitest.config.ts`);
      assert.ok(committed.thresholds.web[metric] >= configured, `${metric} threshold is below the vitest floor`);
    }
  });
});

describe("evaluate", () => {
  it("passes when every metric meets its threshold", () => {
    assert.ok(evaluate("web", thresholds, summary(70)).every((r) => r.ok));
  });

  it("fails the metric that is below its threshold", () => {
    const rows = evaluate("web", thresholds, summary(55));
    assert.equal(rows.find((r) => r.metric === "functions").ok, true);
    assert.equal(rows.find((r) => r.metric === "lines").ok, false);
  });

  it("throws on missing thresholds or a malformed report instead of passing", () => {
    assert.throws(() => evaluate("python", thresholds, {}), /no thresholds/);
    assert.throws(() => evaluate("web", thresholds, {}), /no total/);
    assert.throws(() => evaluate("web", thresholds, { total: { lines: { pct: 1 } } }), /no statements\.pct/);
  });
});

describe("main", () => {
  const files = { t: JSON.stringify(thresholds), ok: JSON.stringify(summary(70)), low: JSON.stringify(summary(10)) };
  const reader = (p) => files[p];
  const run = (name) => {
    const original = process.stdout.write;
    process.stdout.write = () => true;
    try {
      return main(["--component", "web", "--summary", name, "--thresholds", "t"], reader);
    } finally {
      process.stdout.write = original;
    }
  };

  it("exits 0 above the thresholds and 1 below them", () => {
    assert.equal(run("ok"), 0);
    assert.equal(run("low"), 1);
  });

  it("renders a table with a status column", () => {
    assert.ok(renderTable("web", evaluate("web", thresholds, summary(10))).includes("FAIL"));
  });

  it("requires both arguments", () => {
    assert.throws(() => main([], reader), /required/);
  });
});
