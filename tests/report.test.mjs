// Renderers: the text report humans read and the JSON shape CI parses.
// The JSON shape is documented in the README as stable — these tests are
// the contract.
import test from "node:test";
import assert from "node:assert/strict";

import {
  checkMarkdown,
  renderJson,
  renderRulesJson,
  renderRulesText,
  renderText,
  RULES,
  VERSION,
} from "../dist/index.js";

const report = (path, source, options) => ({ path, result: checkMarkdown(source, options) });

test("text report: path:line:col, severity, code, message, fix line and verdict", () => {
  const out = renderText([report("doc.md", "![](x.png)\n")]);
  assert.match(out, /^doc\.md:1:1 {2}error A101 {2}image has no alt text$/m);
  assert.match(out, /^ {4}fix: describe the image/m);
  assert.match(out, /^doc\.md: FAIL \(1 error, 0 warnings\)$/m);
});

test("text report: clean file is a single OK line; suppressed counts are surfaced", () => {
  assert.equal(renderText([report("ok.md", "# Fine\n")]), "ok.md: OK (0 errors, 0 warnings)\n");
  const out = renderText([report("s.md", "<!-- a11ymark-disable-next-line -->\n![](x.png)\n")]);
  assert.match(out, /OK \(0 errors, 0 warnings, 1 suppressed\)/);
});

test("text report: quiet mode drops findings; multi-file runs append a grand total", () => {
  const quiet = renderText([report("doc.md", "![](x.png)\n")], { quiet: true });
  assert.equal(quiet.includes("A101"), false);
  assert.match(quiet, /doc\.md: FAIL/);
  const multi = renderText([
    report("a.md", "![](x.png)\n"),
    report("b.md", "<https://example.test>\n"),
  ]);
  // Counts are grammatical: "1 error" singular, "2 files"/"0 warnings" plural.
  assert.match(multi, /2 files checked: 1 error, 1 warning\n$/);
});

test("json report: stable shape — tool, version, files with counts, summary", () => {
  const parsed = JSON.parse(renderJson([report("doc.md", "![](x.png)\n")]));
  assert.equal(parsed.tool, "a11ymark");
  assert.equal(parsed.version, VERSION);
  assert.equal(parsed.files[0].path, "doc.md");
  assert.equal(parsed.files[0].errors, 1);
  assert.deepEqual(parsed.summary, { files: 1, errors: 1, warnings: 0 });
});

test("json report: diagnostics carry code, severity, position and hint", () => {
  const parsed = JSON.parse(renderJson([report("doc.md", "[click here](x.md)\n")]));
  const diag = parsed.files[0].diagnostics[0];
  assert.equal(diag.code, "A110");
  assert.equal(diag.severity, "error");
  assert.equal(diag.line, 1);
  assert.equal(diag.column, 1);
  assert.ok(diag.hint.length > 0);
});

test("renderers are deterministic: same input, same bytes", () => {
  const reports = [report("doc.md", "![](x.png)\n## two\n")];
  assert.equal(renderText(reports), renderText(reports));
  assert.equal(renderJson(reports), renderJson(reports));
});

test("rules renderers: text table lists every code once, json carries wcag + severity", () => {
  const out = renderRulesText();
  for (const rule of RULES) assert.match(out, new RegExp(`^${rule.code} `, "m"));
  assert.equal(out.trimEnd().split("\n").length, RULES.length);
  const parsed = JSON.parse(renderRulesJson());
  assert.equal(parsed.rules.length, RULES.length);
  const a110 = parsed.rules.find((r) => r.code === "A110");
  assert.equal(a110.wcag, "2.4.4");
  assert.equal(a110.severity, "error");
});
