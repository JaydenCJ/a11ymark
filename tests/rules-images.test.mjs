// Alt-text rules A101–A105. The distinctions here are the product:
// missing vs placeholder vs redundant vs decorative each demand a
// different fix, so each must be classified precisely.
import test from "node:test";
import assert from "node:assert/strict";

import { isPlaceholderAlt } from "../dist/index.js";
import { codes, diags } from "./helpers.mjs";

test("A101: markdown empty alt and html img without alt attribute", () => {
  assert.deepEqual(codes("![](chart.png)\n"), ["A101"]);
  assert.deepEqual(codes('<img src="chart.png">\n'), ["A101"]);
});

test("no finding: html alt='' is documented decoration; descriptive alt passes", () => {
  assert.deepEqual(codes('<img src="border.png" alt="">\n'), []);
  assert.deepEqual(codes("![Quarterly revenue by region, Q3 2026](chart.png)\n"), []);
});

test("A102: bare placeholder words, case-insensitively and past punctuation", () => {
  for (const alt of ["image", "Image.", "SCREENSHOT", "photo", "logo", "tbd"]) {
    assert.deepEqual(codes(`![${alt}](x.png)\n`), ["A102"], `alt=${alt}`);
  }
  // A keyword inside a real description is not a placeholder.
  assert.equal(isPlaceholderAlt("The team logo on a white banner", "x.png"), false);
  assert.equal(isPlaceholderAlt("logo", "x.png"), true);
});

test("A102: camera-roll names, filename-like alts, and alt equal to the src basename", () => {
  for (const alt of ["IMG_1234", "DSC 0042", "Screenshot 2026-07-04", "hero.png"]) {
    assert.deepEqual(codes(`![${alt}](x.png)\n`), ["A102"], `alt=${alt}`);
  }
  assert.deepEqual(codes("![deploy-flow](img/deploy-flow.png)\n"), ["A102"]);
  assert.deepEqual(codes("![deploy-flow.png](img/deploy-flow.png)\n"), ["A102"]);
});

test("A103: redundant prefixes warn with the trimmed suggestion; 'of' mid-sentence does not", () => {
  const found = diags("![Screenshot of the settings page](s.png)\n");
  assert.equal(found.length, 1);
  assert.equal(found[0].code, "A103");
  assert.equal(found[0].severity, "warning");
  assert.match(found[0].hint, /the settings page/);
  assert.deepEqual(codes("![A photo of the venue](v.jpg)\n"), ["A103"]);
  assert.deepEqual(codes("![Illustration showing the data flow](d.svg)\n"), ["A103"]);
  assert.deepEqual(codes("![Map of the campus](m.png)\n"), []);
});

test("A104: image-only link with empty alt fires once, on the link", () => {
  const found = diags("[![](logo.svg)](https://example.test)\n");
  assert.deepEqual(
    found.map((d) => d.code),
    ["A104"]
  );
  assert.equal(found[0].severity, "error");
});

test("no A104: alt naming the destination passes; alt-less image beside text is A101", () => {
  assert.deepEqual(codes("[![Project homepage](logo.svg)](https://example.test)\n"), []);
  assert.deepEqual(codes("[![](icon.svg) Download page](d.md)\n"), ["A101"]);
});

test("A105: alt over the 125-character default warns with the count; budget is configurable", () => {
  const longAlt = "A ".repeat(70).trim();
  const found = diags(`![${longAlt}](x.png)\n`);
  assert.deepEqual(
    found.map((d) => d.code),
    ["A105"]
  );
  assert.match(found[0].message, /139 characters/);
  assert.deepEqual(codes("![A very fine chart](x.png)\n", { maxAltLength: 10 }), ["A105"]);
  assert.deepEqual(codes("![A very fine chart](x.png)\n", { maxAltLength: 200 }), []);
});

test("rule precedence: a placeholder alt reports A102 only, never A103/A105 too", () => {
  assert.deepEqual(codes("![screenshot](x.png)\n", { maxAltLength: 5 }), ["A102"]);
});

test("diagnostics carry the 1-based line and column of the image", () => {
  const found = diags("text\n\nsome ![](x.png)\n");
  assert.equal(found[0].line, 3);
  assert.equal(found[0].column, 6);
});
