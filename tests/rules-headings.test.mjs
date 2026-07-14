// Heading rules A120–A124. The heading outline IS the navigation for
// screen-reader users (rotor / heading-jump keys), so structure errors
// here are navigation errors, not style nits.
import test from "node:test";
import assert from "node:assert/strict";

import { codes, diags } from "./helpers.mjs";

test("A120: level jump 2 → 4 reports the skipped level with a concrete fix", () => {
  const found = diags("# T\n\n## A\n\n#### B\n");
  assert.deepEqual(
    found.map((d) => d.code),
    ["A120"]
  );
  assert.match(found[0].message, /from 2 to 4/);
  assert.match(found[0].hint, /### /);
});

test("A120 is relative to the previous heading; ascent is always legal", () => {
  // B does not jump relative to A, so only A fires.
  assert.deepEqual(codes("# T\n\n### A\n\n### B\n"), ["A120"]);
  // Going back up any number of levels never fires A120.
  assert.deepEqual(codes("# T\n\n## A\n\n### deep\n\n# top\n", { disable: ["A122"] }), []);
});

test("A121: document starting at level 2 warns; heading-free documents do not", () => {
  const found = diags("## Getting started\n");
  assert.deepEqual(
    found.map((d) => d.code),
    ["A121"]
  );
  assert.equal(found[0].severity, "warning");
  assert.deepEqual(codes("just a paragraph\n"), []);
});

test("A122: second level-1 heading warns; the first does not", () => {
  const found = diags("# One\n\n# Two\n");
  assert.deepEqual(
    found.map((d) => [d.code, d.line]),
    [["A122", 3]]
  );
});

test("A123: empty heading, including one that is only emphasis markers", () => {
  const found = diags("# T\n\n##\n");
  assert.deepEqual(
    found.map((d) => d.code),
    ["A123"]
  );
  assert.equal(found[0].severity, "error");
  assert.deepEqual(codes("# T\n\n## **** \n"), ["A123"]);
});

test("A123: '## #' is all closing sequence — empty per CommonMark, not the text '#'", () => {
  assert.deepEqual(codes("# T\n\n## #\n"), ["A123"]);
  assert.deepEqual(codes("# T\n\n## ###\n"), ["A123"]);
  // A trailing closing sequence after real text still renders that text.
  assert.deepEqual(codes("# T\n\n## Setup ##\n"), []);
});

test("A124: standalone bold paragraph suggests a real heading", () => {
  const found = diags("# T\n\nintro\n\n**Configuration**\n\nbody\n");
  assert.deepEqual(
    found.map((d) => d.code),
    ["A124"]
  );
  assert.equal(found[0].hint, "make it a real heading: ## Configuration");
});

test("no A124: bold lead-in followed by text on the same line", () => {
  assert.deepEqual(codes("# T\n\n**Warning:** do not do this\n"), []);
});

test("setext and blockquoted headings participate in level tracking", () => {
  assert.deepEqual(codes("Title\n=====\n\n### deep\n"), ["A120"]);
  assert.deepEqual(codes("# T\n\n> #### quoted deep\n"), ["A120"]);
});
