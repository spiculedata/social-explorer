import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Regression tests for .github/dependabot.yml:
// - vitest and its coverage plugin must update together (@vitest/coverage-v8 pins an exact
//   vitest version, so separate bumps fail `npm ci` with ERESOLVE — spiculedata/social-explorer#320);
// - the pip entries must not overlap: Dependabot's pip scan searches subdirectories
//   recursively, so a / entry alongside per-directory entries opened a duplicate PR per bump
//   (five pairs on 2026-11-22) — spiculedata/social-explorer#355.
const FILE = ".github/dependabot.yml";

// Small block-YAML subset parser (two-space indents, "- " list items, inline [a, b] arrays).
// No dependency on a YAML library: the scripts tests run on the Node standard library only.
function parseYaml(text) {
  const lines = text.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed !== "" && !trimmed.startsWith("#");
  });
  let i = 0;

  const indentOf = (line) => line.length - line.trimStart().length;

  const parseScalar = (raw) => {
    raw = raw.trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      return raw
        .slice(1, -1)
        .split(",")
        .map((item) => parseScalar(item))
        .filter((item) => item !== "");
    }
    return raw.replace(/^["']|["']$/g, "");
  };

  const parseList = (indent) => {
    const list = [];
    while (
      i < lines.length &&
      indentOf(lines[i]) === indent &&
      lines[i].trimStart().startsWith("- ")
    ) {
      // Replace the "- " marker with spaces so the item lines up with a normal mapping line.
      lines[i] = lines[i].replace(/^(\s*)- /, "$1  ");
      const content = lines[i].trim();
      if (content.includes(":")) {
        list.push(parseMapping(indent + 2));
      } else {
        list.push(parseScalar(content));
        i += 1;
      }
    }
    return list;
  };

  const parseMapping = (indent) => {
    const map = {};
    while (i < lines.length) {
      const line = lines[i];
      const lineIndent = indentOf(line);
      if (lineIndent < indent) break;
      if (lineIndent > indent) {
        throw new Error(`unexpected indent on line: ${line.trim()}`);
      }
      if (line.trimStart().startsWith("- ")) break;
      const colon = line.indexOf(":");
      assert.ok(colon > 0, `expected key: value, got: ${line.trim()}`);
      const key = line.slice(0, colon).trim();
      const rest = line.slice(colon + 1).trim();
      i += 1;
      if (rest === "") {
        if (
          i < lines.length &&
          indentOf(lines[i]) > indent &&
          lines[i].trimStart().startsWith("- ")
        ) {
          map[key] = parseList(indentOf(lines[i]));
        } else if (i < lines.length && indentOf(lines[i]) > indent) {
          map[key] = parseMapping(indentOf(lines[i]));
        } else {
          map[key] = null;
        }
      } else {
        map[key] = parseScalar(rest);
      }
    }
    return map;
  };

  return parseMapping(indentOf(lines[0]));
}

const read = () => readFileSync(FILE, "utf8");
const entries = () => parseYaml(read()).updates;
const pipEntries = () => entries().filter((e) => e["package-ecosystem"] === "pip");

describe("dependabot.yml", () => {
  it("groups vitest with its @vitest/* plugins in the UI npm entry", () => {
    const ui = entries().find(
      (e) => e["package-ecosystem"] === "npm" && e.directory === "/ex-accell-ui",
    );
    assert.ok(ui, "no npm entry for /ex-accell-ui");
    const groupPatterns = Object.values(ui.groups ?? {}).flatMap(
      (group) => group.patterns ?? [],
    );
    assert.ok(
      groupPatterns.includes("vitest"),
      "vitest is not in a group: coverage-v8 bumps would fail npm ci on ERESOLVE",
    );
    assert.ok(
      groupPatterns.includes("@vitest/*"),
      "@vitest/* is not in a group with vitest",
    );
  });

  it("declares the root pip manifest in its own entry with the subdirectories excluded", () => {
    const root = pipEntries().find((e) => e.directory === "/");
    assert.ok(root, "the pip / entry is gone: requirements-local.txt loses coverage");
    for (const excluded of ["etl/**", "jupyter/**", "wavepulse/**", "ex-accell-ui/**"]) {
      assert.ok(
        root["exclude-paths"]?.includes(excluded),
        `the pip / entry does not exclude ${excluded}: its recursive scan would duplicate the per-directory entries`,
      );
    }
  });

  it("covers the other pip directories once each, without a / entry among them", () => {
    const multi = pipEntries().filter((e) => e.directories);
    assert.equal(
      multi.length,
      1,
      "more than one pip entry lists directories: keep the subdirectories in a single entry",
    );
    const declared = multi[0].directories;
    assert.deepEqual(
      [...declared].sort(),
      ["/etl", "/ex-accell-ui", "/jupyter", "/wavepulse"].sort(),
      "the pip subdirectory entry no longer covers every python directory",
    );
    assert.ok(
      !declared.includes("/"),
      "/ must not be listed with the subdirectories: pip scans subdirectories recursively and the entries overlap",
    );
  });

  it("keeps grouped minor and patch pip updates with majors separate", () => {
    const pipEntriesAll = pipEntries();
    assert.ok(pipEntriesAll.length >= 2, "the pip entries are missing");
    for (const entry of pipEntriesAll) {
      const groups = Object.values(entry.groups ?? {});
      assert.equal(groups.length, 1, `each pip entry needs exactly one group: ${entry.directory ?? entry.directories}`);
      assert.deepEqual(
        groups[0]["update-types"],
        ["minor", "patch"],
        "pip groups must stay minor and patch only; majors update separately",
      );
    }
  });

  it("keeps the python image ignores for /etl, /wavepulse and /jupyter", () => {
    for (const dir of ["/etl", "/wavepulse", "/jupyter"]) {
      const docker = entries().find(
        (e) => e["package-ecosystem"] === "docker" && e.directory === dir,
      );
      assert.ok(docker, `no docker entry for ${dir}`);
      assert.ok(
        docker.ignore?.some((rule) => rule["dependency-name"] === "python"),
        `the docker ${dir} entry lost its python ignore`,
      );
    }
  });
});
