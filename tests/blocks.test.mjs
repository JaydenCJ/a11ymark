// Block scanner: which lines get linted, and how block structures
// (headings, tables, bold paragraphs, suppressions) are recognized.
// The skip logic matters as much as the match logic — a rule firing
// inside a code fence would make the tool unusable on real READMEs.
import test from "node:test";
import assert from "node:assert/strict";

import { parseMarkdown, splitTableRow } from "../dist/index.js";

test("atx headings: level, text, closing hashes; inline markup is stripped", () => {
  const doc = parseMarkdown("# Title\n\n### Sub ###\n\n## The **big** [guide](g.md)\n");
  assert.deepEqual(
    doc.headings.map((h) => [h.level, h.text]),
    [
      [1, "Title"],
      [3, "Sub"],
      [2, "The big guide"],
    ]
  );
});

test("setext headings map = to level 1 and - to level 2", () => {
  const doc = parseMarkdown("Title\n=====\n\nSection\n-------\n");
  assert.deepEqual(
    doc.headings.map((h) => [h.level, h.text, h.style]),
    [
      [1, "Title", "setext"],
      [2, "Section", "setext"],
    ]
  );
});

test("code blocks are never linted: backtick fences, tilde fences, indented blocks", () => {
  const fenced = parseMarkdown("```md\n![](x.png)\n# fake heading\n```\n");
  assert.equal(fenced.images.length, 0);
  assert.equal(fenced.headings.length, 0);
  // A longer tilde run closes the fence; content after it is linted again.
  const tilde = parseMarkdown("~~~\n![](x.png)\n~~~~\ntext ![ok](y.png)\n");
  assert.equal(tilde.images.length, 1);
  assert.equal(tilde.images[0].alt, "ok");
  const indented = parseMarkdown("para\n\n    ![](in-code.png)\n\n![](real.png)\n");
  assert.equal(indented.images.length, 1);
  assert.equal(indented.images[0].line, 5);
});

test("yaml front matter is skipped; a mid-document --- is a break, not front matter", () => {
  const doc = parseMarkdown("---\ntitle: '# not a heading'\n---\n# Real\n\ntext\n\n---\n\nmore\n");
  assert.equal(doc.headings.length, 1);
  assert.equal(doc.headings[0].text, "Real");
});

test("blockquote content is linted with columns into the original line", () => {
  const doc = parseMarkdown("> ![](quoted.png)\n");
  assert.equal(doc.images.length, 1);
  assert.equal(doc.images[0].column, 3);
});

test("reference definitions feed the ref map but are not linted as content", () => {
  const doc = parseMarkdown("![Chart][c]\n\n[c]: chart.png\n");
  assert.equal(doc.images.length, 1);
  assert.equal(doc.images[0].src, "chart.png");
  assert.equal(doc.links.length, 0);
});

test("html comments are invisible, including multi-line ones", () => {
  const doc = parseMarkdown("<!-- ![](hidden.png) -->\n<!--\n[x](y.md)\n--> after ![ok](b.png)\n");
  assert.equal(doc.images.length, 1);
  assert.equal(doc.images[0].alt, "ok");
  assert.equal(doc.links.length, 0);
});

test("pipe table: header + delimiter row produce a table node with cells", () => {
  const doc = parseMarkdown("| Name | Age |\n|---|---|\n| a | 1 |\n");
  assert.equal(doc.tables.length, 1);
  assert.equal(doc.tables[0].kind, "pipe");
  assert.deepEqual(
    doc.tables[0].headerCells.map((c) => c.text),
    ["Name", "Age"]
  );
  assert.equal(doc.tables[0].hasHeaderCells, true);
  // A pipe line without a delimiter row underneath is not a table.
  assert.equal(parseMarkdown("| just | text |\nno delimiter row\n").tables.length, 0);
});

test("splitTableRow: escaped pipes, code spans, outer pipes, 1-based columns", () => {
  const cells = splitTableRow("| a \\| b | `c|d` | e |", 0);
  assert.deepEqual(
    cells.map((c) => c.text),
    ["a \\| b", "`c|d`", "e"]
  );
  const positions = splitTableRow("| ab | cd |", 0);
  assert.equal(positions[0].column, 3);
  assert.equal(positions[1].column, 8);
});

test("html tables: <th> presence and role=presentation are tracked", () => {
  const doc = parseMarkdown(
    "<table><tr><th>H</th></tr></table>\n\n" +
      '<table role="presentation"><tr><td>x</td></tr></table>\n'
  );
  assert.equal(doc.tables.length, 2);
  assert.equal(doc.tables[0].hasHeaderCells, true);
  assert.equal(doc.tables[1].presentational, true);
});

test("bold paragraph standing alone is a heading look-alike; lead-ins are not", () => {
  const doc = parseMarkdown(
    "intro\n\n**Configuration**\n\n**Note:** inline lead-in\n\n**A full sentence ends here.**\n"
  );
  assert.equal(doc.boldParagraphs.length, 1);
  assert.equal(doc.boldParagraphs[0].text, "Configuration");
  assert.equal(doc.boldParagraphs[0].line, 3);
});

test("suppression directives: next-line with codes, file-level without", () => {
  const doc = parseMarkdown(
    "<!-- a11ymark-disable-next-line A101, A102 -->\n![](x.png)\n\n<!-- a11ymark-disable-file -->\n"
  );
  assert.equal(doc.suppressions.length, 2);
  assert.equal(doc.suppressions[0].kind, "next-line");
  assert.equal(doc.suppressions[0].targetLine, 2);
  assert.deepEqual(doc.suppressions[0].codes, ["A101", "A102"]);
  assert.equal(doc.suppressions[1].kind, "file");
  assert.equal(doc.suppressions[1].codes, null);
});

test("crlf and lone-cr line endings produce the same line numbers", () => {
  for (const eol of ["\n", "\r\n", "\r"]) {
    const doc = parseMarkdown(`# T${eol}${eol}![](x.png)${eol}`);
    assert.equal(doc.images[0].line, 3, `eol=${JSON.stringify(eol)}`);
  }
});
