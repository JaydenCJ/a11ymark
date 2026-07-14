// Link rules A110–A113. WCAG 2.4.4: link purpose must be determinable
// from the link text alone — screen-reader users navigate by tabbing
// through a list of links stripped of all surrounding context.
import test from "node:test";
import assert from "node:assert/strict";

import { isGenericLinkText, isUrlLinkText } from "../dist/index.js";
import { codes, diags } from "./helpers.mjs";

test("A110: 'click here' and friends error, case-insensitively and past trailing punctuation", () => {
  const found = diags("Please [click here](docs/install.md) to install.\n");
  assert.deepEqual(
    found.map((d) => d.code),
    ["A110"]
  );
  assert.equal(found[0].severity, "error");
  for (const text of ["Click Here", "READ MORE", "here", "Learn more…", "this link", "More info:"]) {
    assert.deepEqual(codes(`[${text}](x.md)\n`), ["A110"], `text=${text}`);
  }
});

test("no A110: descriptive text passes, even when it contains a generic word", () => {
  assert.deepEqual(codes("[installation guide](docs/install.md)\n"), []);
  assert.deepEqual(codes("[more about heading structure](h.md)\n"), []);
  assert.equal(isGenericLinkText("Read more →"), true);
  assert.equal(isGenericLinkText("release notes"), false);
});

test("A111: autolinks and URL-shaped link text warn, even when href differs", () => {
  assert.deepEqual(codes("See <https://example.test/getting-started>\n"), ["A111"]);
  assert.deepEqual(codes("[https://example.test/a](https://example.test/b)\n"), ["A111"]);
  assert.deepEqual(codes("[www.example.test](https://example.test)\n"), ["A111"]);
});

test("no A111: mailto is exempt, and prose containing a URL is not URL-shaped", () => {
  assert.deepEqual(codes("<mailto:docs@example.test>\n"), []);
  assert.equal(isUrlLinkText("https://example.test/x?y=1"), true);
  assert.equal(isUrlLinkText("see https://example.test"), false);
});

test("A112: empty markdown link and empty html anchor", () => {
  assert.deepEqual(codes("[](https://example.test)\n"), ["A112"]);
  assert.deepEqual(codes('<a href="https://example.test"></a>\n'), ["A112"]);
});

test("A113: same text to two destinations warns on the later use, citing the first", () => {
  const found = diags("[release notes](v1.md) and later [release notes](v2.md)\n");
  assert.deepEqual(
    found.map((d) => d.code),
    ["A113"]
  );
  assert.match(found[0].message, /line 1/);
});

test("no A113: same text to the same destination is fine (repeated nav links)", () => {
  assert.deepEqual(codes("[docs](d.md) then [docs](d.md)\n"), []);
});

test("A113 matching is case-insensitive across lines", () => {
  const found = diags("[Release Notes](v1.md)\n\n[release notes](v2.md)\n");
  assert.deepEqual(
    found.map((d) => [d.code, d.line]),
    [["A113", 3]]
  );
});

test("no A113 for generic texts: A110 already covers each occurrence", () => {
  assert.deepEqual(codes("[here](a.md) [here](b.md)\n"), ["A110", "A110"]);
});

test("link text built from an image alt participates in link rules", () => {
  // The accessible name of [![Click here](x.png)](y.md) is "Click here".
  assert.deepEqual(codes("[![Click here](x.png)](y.md)\n"), ["A110"]);
});
