// Inline suppressions and the --disable option. False positives happen;
// what matters is that the escape hatches are precise (per-line, per-code)
// and visible (suppressed counts are reported, not swallowed).
import test from "node:test";
import assert from "node:assert/strict";

import { checkMarkdown } from "../dist/index.js";
import { codes } from "./helpers.mjs";

test("disable-next-line without codes suppresses everything on that line only", () => {
  const result = checkMarkdown("<!-- a11ymark-disable-next-line -->\n![](x.png) [here](y.md)\n![](b.png)\n");
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.line]),
    [["A101", 3]]
  );
  assert.equal(result.suppressed, 2);
});

test("disable-next-line with codes suppresses only those codes", () => {
  const result = checkMarkdown("<!-- a11ymark-disable-next-line A101 -->\n![](x.png) [here](y.md)\n");
  assert.deepEqual(
    result.diagnostics.map((d) => d.code),
    ["A110"]
  );
  assert.equal(result.suppressed, 1);
});

test("disable-file silences the whole document; with codes, only those codes", () => {
  const whole = checkMarkdown("<!-- a11ymark-disable-file -->\n![](x.png)\n\n## start at two\n");
  assert.deepEqual(whole.diagnostics, []);
  assert.equal(whole.suppressed, 2);

  const scoped = checkMarkdown(
    "<!-- a11ymark-disable-file A101 -->\n![](x.png)\n\n![](y.png)\n\n[here](z.md)\n"
  );
  assert.deepEqual(
    scoped.diagnostics.map((d) => d.code),
    ["A110"]
  );
  assert.equal(scoped.suppressed, 2);
});

test("directive codes accept comma or space separators; the comment itself is never linted", () => {
  assert.deepEqual(codes("<!-- a11ymark-disable-next-line A101 A110 -->\n![](x.png) [here](y.md)\n"), []);
  assert.deepEqual(codes("<!-- a11ymark-disable-next-line A103 -->\n![Photo of the team](t.jpg)\n"), []);
});

test("options.disable switches rules off for the run without counting as suppressed", () => {
  assert.deepEqual(codes("![Screenshot of x](a.png)\n<https://example.test>\n", { disable: ["A103", "A111"] }), []);
  const result = checkMarkdown("![](x.png)\n", { disable: ["A101"] });
  assert.equal(result.suppressed, 0);
  assert.equal(result.errors, 0);
});

test("errors and warnings are tallied separately in the result", () => {
  const result = checkMarkdown("![](x.png)\n\n<https://example.test>\n");
  assert.equal(result.errors, 1);
  assert.equal(result.warnings, 1);
});
