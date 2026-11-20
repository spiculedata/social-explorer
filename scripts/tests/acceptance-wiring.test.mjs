// Guards the acceptance-spec wiring: every caller shares one full-SHA pin, the callers run in report
// mode and stay outside `ci`, the guards are report-only, and the convention cutoff is a literal.
// Hermetic: reads workflow files only. A guard file pinned to a different SHA is NOT failed here: that
// drift is what thin-caller-gate reports, and it must not turn anything red.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const DIR = ".github/workflows";
const read = (name) => readFileSync(`${DIR}/${name}`, "utf8");
const code = (text) => text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const SHARED = /spiculedata\/acceptance-spec\/\.github\/workflows\/([\w-]+)\.yml@(\S+)/g;
const callers = () =>
  readdirSync(DIR)
    .filter((f) => f.endsWith(".yml"))
    .flatMap((f) => [...read(f).matchAll(SHARED)].map((m) => ({ file: f, workflow: m[1], ref: m[2] })));

describe("acceptance-spec wiring", () => {
  it("pins every shared workflow reference to a full commit SHA", () => {
    const pins = callers();
    assert.ok(pins.length >= 5, "convention, run-specs, base-check, thin-caller-gate and pin-health");
    for (const p of pins) assert.match(p.ref, /^[0-9a-f]{40}$/, `${p.file} (${p.workflow}) is not pinned to a full SHA`);
  });

  it("keeps the three acceptance callers on one pin", () => {
    const pins = callers().filter((p) => p.file === "acceptance.yml");
    assert.deepEqual(pins.map((p) => p.workflow).sort(), ["base-check", "convention", "run-specs"]);
    assert.equal(new Set(pins.map((p) => p.ref)).size, 1);
  });

  it("runs the callers on pull_request only, in report mode, with a read-only token and no secrets", () => {
    const text = code(read("acceptance.yml"));
    assert.match(text, /^on:\n {2}pull_request:/m);
    assert.doesNotMatch(text, /pull_request_target|workflow_run|push:/);
    assert.equal([...text.matchAll(/mode: report/g)].length, 3);
    assert.doesNotMatch(text, /mode: enforce/);
    assert.match(text, /^permissions:\n {2}contents: read$/m);
    assert.doesNotMatch(text, /secrets\./);
    assert.doesNotMatch(text, /secrets: inherit/);
  });

  it("keeps the convention cutoff a literal that is not silently lowered", () => {
    const text = code(read("acceptance.yml"));
    const cutoff = Number(text.match(/enforce-from-issue: "(\d+)"/)?.[1]);
    assert.ok(cutoff >= 303, `cutoff ${cutoff} is below the adoption cutoff 303`);
  });

  it("keeps the acceptance jobs and the guards out of the ci rollup", () => {
    const test = read("test.yml");
    assert.doesNotMatch(test, /acceptance|thin-caller-gate/);
  });

  it("keeps thin-caller-gate in report mode", () => {
    const gate = code(read("thin-caller-gate.yml"));
    assert.match(gate, /mode: report/);
    assert.doesNotMatch(gate, /mode: enforce/);
  });

  it("runs pin-health weekly and on dispatch, opens no issue, and holds issues: write on the caller job", () => {
    const text = code(read("acceptance-pin-health.yml"));
    assert.match(text, /cron: "0 7 \* \* 1"/);
    assert.match(text, /workflow_dispatch:/);
    assert.match(text, /open-issue: false/);
    assert.match(text, /^ {6}issues: write/m);
  });
});
