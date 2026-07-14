// Inline scanner: images, links and code-span masking on a single line.
// These tests pin down the CommonMark corner cases the rules depend on —
// if extraction is wrong, every downstream diagnostic points at the wrong
// thing or fires on constructs that never render.
import test from "node:test";
import assert from "node:assert/strict";

import { maskCodeSpans, scanInline } from "../dist/index.js";

const scan = (line, refs = new Map()) => scanInline(line, 1, refs);

test("markdown image: alt, src, kind and 1-based column; empty alt is alt=''", () => {
  const { images } = scan('Intro ![A red panda](panda.png "title") and ![](decor.png)');
  assert.equal(images.length, 2);
  assert.equal(images[0].alt, "A red panda");
  assert.equal(images[0].src, "panda.png");
  assert.equal(images[0].column, 7);
  assert.equal(images[0].kind, "markdown");
  assert.equal(images[1].alt, "");
  assert.equal(images[1].altProvided, true);
  assert.equal(images[1].explicitlyDecorative, false);
});

test("reference images resolve through the ref map; undefined labels render as text", () => {
  const refs = new Map([
    ["logo", "logo.svg"],
    ["team photo", "team.jpg"],
  ]);
  const { images } = scan("![The logo][logo], ![Team photo][] and ![nope][missing]", refs);
  assert.equal(images.length, 2);
  assert.equal(images[0].src, "logo.svg");
  assert.equal(images[0].kind, "reference");
  assert.equal(images[1].src, "team.jpg"); // collapsed [] uses its own label
});

test("html img: missing alt vs alt='' are distinguished; all quoting styles parse", () => {
  const { images } = scan(`<img src="a.png"> <img src="b.png" alt=""> <img alt='c' src=bare.png>`);
  assert.equal(images.length, 3);
  assert.equal(images[0].altProvided, false);
  assert.equal(images[0].explicitlyDecorative, false);
  assert.equal(images[1].altProvided, true);
  assert.equal(images[1].explicitlyDecorative, true);
  assert.equal(images[2].alt, "c");
  assert.equal(images[2].src, "bare.png");
});

test("inline link: text, href, column; emphasis stripped; both destination forms", () => {
  const { links } = scan("See [**the** _install_ `guide`](docs/install.md).");
  assert.equal(links.length, 1);
  assert.equal(links[0].text, "the install guide");
  assert.equal(links[0].href, "docs/install.md");
  assert.equal(links[0].column, 5);
  const forms = scan('[a](<dest with space.md>) [b](plain.md "title")');
  assert.equal(forms.links[0].href, "dest with space.md");
  assert.equal(forms.links[1].href, "plain.md");
});

test("autolinks and html anchors are captured with kind, text and href", () => {
  const { links } = scan('Visit <https://example.test/docs> or <a href="https://example.test">Docs home</a>');
  assert.equal(links[0].kind, "autolink");
  assert.equal(links[0].text, "https://example.test/docs");
  assert.equal(links[0].href, "https://example.test/docs");
  assert.equal(links[1].kind, "html");
  assert.equal(links[1].text, "Docs home");
});

test("image inside a link: attached to the link, alt feeds the accessible name", () => {
  const { links, images } = scan("[![Logo](logo.svg)](https://example.test)");
  assert.equal(links.length, 1);
  assert.equal(links[0].images.length, 1);
  assert.equal(links[0].text, "Logo");
  assert.equal(images[0].insideLink, true);
  assert.equal(images[0].linkHasOtherText, false);
  // With text beside the image, linkHasOtherText flips.
  const mixed = scan("[![](icon.svg) Download page](d.md)");
  assert.equal(mixed.images[0].insideLink, true);
  assert.equal(mixed.images[0].linkHasOtherText, true);
});

test("code spans hide link/image syntax; masking is column-preserving; strays stay", () => {
  const { links, images } = scan("Use `[not a link](x)` and `![not an image](y)` literally");
  assert.equal(links.length, 0);
  assert.equal(images.length, 0);
  const original = "a ``code `tick` span`` z";
  const masked = maskCodeSpans(original);
  assert.equal(masked.length, original.length);
  assert.equal(masked.endsWith(" z"), true);
  assert.equal(masked.includes("tick"), false);
  // An unmatched backtick run renders literally, so scanning continues past it.
  const stray = scan("a ` stray [link](x.md)");
  assert.equal(stray.links.length, 1);
});

test("escaped brackets do not open links or images", () => {
  const { links, images } = scan("\\[not a link](x.md) and !\\[not an image](y.png)");
  assert.equal(links.length, 0);
  assert.equal(images.length, 0);
});

test("nested brackets in link text and balanced parens in destinations survive", () => {
  const { links } = scan("[see [section 2] notes](https://example.test/docs_(v2))");
  assert.equal(links.length, 1);
  assert.equal(links[0].text, "see [section 2] notes");
  assert.equal(links[0].href, "https://example.test/docs_(v2)");
});

test("colOffset shifts every reported column (blockquote stripping relies on it)", () => {
  const { links } = scanInline("[a](b.md)", 3, new Map(), 4);
  assert.equal(links[0].column, 5);
  assert.equal(links[0].line, 3);
});
