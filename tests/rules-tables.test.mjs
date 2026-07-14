// Table rules A130–A131. Without header cells a screen reader announces
// bare values with no column context; an unnamed column is announced as
// nothing at all.
import test from "node:test";
import assert from "node:assert/strict";

import { codes, diags } from "./helpers.mjs";

test("A130: pipe table whose header row is entirely empty", () => {
  const found = diags("|  |  |\n|---|---|\n| a | b |\n");
  assert.deepEqual(
    found.map((d) => d.code),
    ["A130"]
  );
  assert.equal(found[0].severity, "error");
});

test("A130: html table without <th>; with <th> it passes", () => {
  assert.deepEqual(codes("<table><tr><td>a</td></tr></table>\n"), ["A130"]);
  assert.deepEqual(codes("<table><tr><th>Name</th></tr><tr><td>a</td></tr></table>\n"), []);
});

test("no A130: role=presentation marks a layout table as exempt", () => {
  assert.deepEqual(codes('<table role="presentation"><tr><td>a</td></tr></table>\n'), []);
});

test("multi-line html table is reported at its opening line", () => {
  const found = diags("<table>\n  <tr><td>a</td></tr>\n</table>\n");
  assert.deepEqual(
    found.map((d) => [d.code, d.line]),
    [["A130", 1]]
  );
});

test("A131: unnamed column warns once per empty cell, column pointing at it", () => {
  const found = diags("| Name |  | Age |\n|---|---|---|\n");
  assert.deepEqual(
    found.map((d) => d.code),
    ["A131"]
  );
  assert.equal(found[0].severity, "warning");
  assert.ok(found[0].column > 6, "column should point into the empty cell");
  assert.deepEqual(codes("|  | Name |  |\n|---|---|---|\n"), ["A131", "A131"]);
});

test("no findings: fully-headed pipe table; tables inside code fences are ignored", () => {
  assert.deepEqual(codes("| Name | Age |\n|---|---|\n| a | 1 |\n"), []);
  assert.deepEqual(codes("```\n|  |  |\n|---|---|\n```\n"), []);
});
