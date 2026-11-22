import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

// One Node major for the whole project. `.nvmrc` is the source of truth; CI, the image and the
// docs must agree with it so they cannot drift apart again.
const read = (path) => readFileSync(path, "utf8");
const major = read(".nvmrc").trim();
const WORKFLOWS = ".github/workflows";

describe("Node version", () => {
  it("is a bare major number in .nvmrc", () => {
    assert.match(major, /^\d+$/);
  });

  it("is used by every setup-node step in the workflows", () => {
    const seen = [];
    for (const file of readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"))) {
      for (const m of read(`${WORKFLOWS}/${file}`).matchAll(/^\s*node-version:\s*["']?([^\s"']+)/gm)) {
        seen.push({ file, value: m[1] });
      }
    }
    assert.ok(seen.length > 0, "expected setup-node steps");
    for (const { file, value } of seen) {
      assert.equal(value.split(".")[0], major, `${file} uses node-version ${value}`);
    }
  });

  it("is the base image of every stage in the ex-accell-ui Dockerfile", () => {
    const froms = [...read("ex-accell-ui/Dockerfile").matchAll(/^FROM\s+node:(\S+)/gim)];
    assert.ok(froms.length > 0, "expected node base images");
    for (const [, tag] of froms) {
      assert.equal(tag.split(/[.-]/)[0], major, `Dockerfile uses node:${tag}`);
    }
  });

  it("is the minimum in the ex-accell-ui engines field", () => {
    const { engines } = JSON.parse(read("ex-accell-ui/package.json"));
    assert.equal(engines?.node, `>=${major}`);
  });

  it("is the version the docs and the demo script ask for", () => {
    const docs = [
      "README.md",
      "CONTRIBUTING.md",
      "AGENTS.md",
      "ex-accell-ui/CLAUDE.md",
      "docs-site/guide/getting-started.md",
      "docs-site/guide/demo-data.md",
      "docs-site/.vitepress/theme/Landing.vue",
      "ex-accell-ui/scripts/demo.sh",
    ];
    for (const file of docs) {
      const text = read(file);
      const mentions = [...text.matchAll(/\bNode(?:\.js)? (\d+)/g)].map((m) => m[1]);
      assert.ok(mentions.length > 0, `${file} does not name a Node version`);
      for (const n of mentions) assert.equal(n, major, `${file} says Node ${n}`);
    }
  });
});
