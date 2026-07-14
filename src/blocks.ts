/**
 * Block scanner: walks a Markdown document line by line, decides which lines
 * are lintable content, and assembles the ParsedDocument model — headings,
 * tables, bold-paragraph heading look-alikes, suppression directives, plus
 * every image and link via the inline scanner.
 *
 * Skipped regions (never linted): YAML front matter, fenced code blocks,
 * indented code blocks, HTML comments and reference-definition lines.
 * Blockquote markers are stripped with a column offset so findings still
 * point into the original source.
 */

import { normalizeLabel, scanInline, type RefMap } from "./inline.js";
import type {
  BoldParagraph,
  HeadingNode,
  ParsedDocument,
  Suppression,
  TableCell,
  TableNode,
} from "./types.js";

const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const SETEXT_UNDERLINE_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const FENCE_OPEN_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const THEMATIC_BREAK_RE = /^ {0,3}((\* *){3,}|(- *){3,}|(_ *){3,})$/;
const LIST_ITEM_RE = /^(\s*)([-*+]|\d{1,9}[.)])[ \t]+/;
const REF_DEF_RE = /^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>]*)>|(\S+))/;
const TABLE_DELIMITER_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const DIRECTIVE_RE = /^\s*a11ymark-(disable-next-line|disable-file)\b([^]*)$/;
const BOLD_LINE_RE = /^(\*\*|__)(?!\s)(.+?)\1$/;

interface ContentLine {
  /** 1-based line number in the source file. */
  line: number;
  /** Text after blockquote stripping. */
  text: string;
  /** Columns of `text[0]` in the original source (0-based). */
  offset: number;
}

/** Strip leading blockquote markers (`>` plus optional space), tracking the offset. */
function stripBlockquote(line: string): { text: string; offset: number } {
  let offset = 0;
  let text = line;
  for (;;) {
    const match = /^ {0,3}>[ ]?/.exec(text);
    if (!match) break;
    offset += match[0].length;
    text = text.slice(match[0].length);
  }
  return { text, offset };
}

function indentOf(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (ch === " ") n += 1;
    else if (ch === "\t") n += 4;
    else break;
  }
  return n;
}

/** Split a pipe-table row into trimmed cells with 1-based source columns. */
export function splitTableRow(text: string, offset: number): TableCell[] {
  const cells: TableCell[] = [];
  let start = 0;
  let i = 0;
  const pushCell = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const leading = raw.length - raw.trimStart().length;
    cells.push({ text: raw.trim(), column: offset + from + leading + 1 });
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") {
      // Skip code spans so pipes inside them do not split cells.
      let run = 0;
      while (text[i + run] === "`") run += 1;
      const close = text.indexOf("`".repeat(run), i + run);
      i = close === -1 ? i + run : close + run;
      continue;
    }
    if (ch === "|") {
      pushCell(start, i);
      start = i + 1;
    }
    i += 1;
  }
  pushCell(start, text.length);
  // Outer pipes produce empty first/last fragments; drop them.
  if (cells.length > 0 && cells[0]!.text === "" && text.trimStart().startsWith("|")) cells.shift();
  if (cells.length > 0 && cells[cells.length - 1]!.text === "" && text.trimEnd().endsWith("|")) {
    cells.pop();
  }
  return cells;
}

function parseDirective(comment: string, endLine: number): Suppression | null {
  const match = DIRECTIVE_RE.exec(comment);
  if (!match) return null;
  const kind = match[1] === "disable-next-line" ? "next-line" : "file";
  const rest = (match[2] ?? "").trim();
  const codes = rest === "" ? null : rest.split(/[\s,]+/).filter((c) => c !== "");
  return { kind, targetLine: endLine + 1, codes };
}

/** Parse a Markdown document into the model every rule consumes. */
export function parseMarkdown(source: string): ParsedDocument {
  const lines = source.split(/\r\n|\r|\n/);
  const doc: ParsedDocument = {
    headings: [],
    images: [],
    links: [],
    tables: [],
    boldParagraphs: [],
    suppressions: [],
  };

  // ---- Pass A: strip skipped regions, collect directives and ref definitions.
  const content: (ContentLine | null)[] = new Array(lines.length).fill(null);
  const refs: RefMap = new Map();

  let inFrontMatter = false;
  let fence: { char: string; length: number } | null = null;
  let inComment = false;
  let commentBuffer = "";
  let inHtmlTable = false;
  let htmlTableHasTh = false;
  let htmlTablePresentational = false;
  let htmlTableStart = { line: 0, column: 0 };
  let prevBlank = true;
  let inIndentedCode = false;
  let listContentIndent: number | null = null;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const raw = lines[idx]!;
    const lineNo = idx + 1;

    // Front matter: only a `---` opener on the very first line counts.
    if (idx === 0 && raw.trimEnd() === "---") {
      inFrontMatter = true;
      continue;
    }
    if (inFrontMatter) {
      const trimmed = raw.trimEnd();
      if (trimmed === "---" || trimmed === "...") inFrontMatter = false;
      continue;
    }

    const { text, offset } = stripBlockquote(raw);

    // Fenced code blocks.
    if (fence) {
      const close = FENCE_OPEN_RE.exec(text);
      if (
        close &&
        close[2]!.startsWith(fence.char) &&
        close[2]!.length >= fence.length &&
        close[3]!.trim() === ""
      ) {
        fence = null;
      }
      prevBlank = false;
      continue;
    }
    const open = FENCE_OPEN_RE.exec(text);
    if (open && !inComment) {
      const marker = open[2]!;
      // Backtick fences must not contain backticks in the info string.
      if (marker[0] === "~" || !open[3]!.includes("`")) {
        fence = { char: marker[0]!, length: marker.length };
        prevBlank = false;
        continue;
      }
    }

    // HTML comments (may span lines). Directives are read from the comment body.
    let working = text;
    let workingOffset = offset;
    if (inComment) {
      const end = working.indexOf("-->");
      if (end === -1) {
        commentBuffer += ` ${working}`;
        continue;
      }
      commentBuffer += ` ${working.slice(0, end)}`;
      const directive = parseDirective(commentBuffer, lineNo);
      if (directive) doc.suppressions.push(directive);
      inComment = false;
      workingOffset += end + 3;
      working = working.slice(end + 3);
    }
    for (;;) {
      const start = working.indexOf("<!--");
      if (start === -1) break;
      const end = working.indexOf("-->", start + 4);
      if (end === -1) {
        inComment = true;
        commentBuffer = working.slice(start + 4);
        working = working.slice(0, start);
        break;
      }
      const directive = parseDirective(working.slice(start + 4, end), lineNo);
      if (directive) doc.suppressions.push(directive);
      working = working.slice(0, start) + " ".repeat(end + 3 - start) + working.slice(end + 3);
    }

    const blank = working.trim() === "";
    if (blank) {
      prevBlank = true;
      inIndentedCode = false;
      continue;
    }

    // HTML tables: track across lines; cells inside are still inline-scanned.
    const lower = working.toLowerCase();
    if (!inHtmlTable && lower.includes("<table")) {
      inHtmlTable = true;
      htmlTableHasTh = false;
      htmlTablePresentational = /<table\b[^>]*role\s*=\s*["']?presentation/i.test(working);
      htmlTableStart = { line: lineNo, column: workingOffset + lower.indexOf("<table") + 1 };
    }
    if (inHtmlTable) {
      if (lower.includes("<th")) htmlTableHasTh = true;
      if (lower.includes("</table>")) {
        doc.tables.push({
          kind: "html",
          headerCells: [],
          hasHeaderCells: htmlTableHasTh,
          presentational: htmlTablePresentational,
          line: htmlTableStart.line,
          column: htmlTableStart.column,
        });
        inHtmlTable = false;
      }
    }

    // List context: nested list content is indented but is not code.
    const listMatch = LIST_ITEM_RE.exec(working);
    if (listMatch) {
      listContentIndent = listMatch[1]!.length + listMatch[2]!.length + 1;
    } else if (indentOf(working) < (listContentIndent ?? 0) && !prevBlank) {
      listContentIndent = null;
    }

    // Indented code blocks (only outside list continuations).
    const indent = indentOf(working);
    if (
      (inIndentedCode && indent >= 4) ||
      (prevBlank && indent >= 4 && (listContentIndent === null || indent < listContentIndent + 4))
    ) {
      if (listContentIndent === null || indent >= listContentIndent + 4) {
        inIndentedCode = true;
        prevBlank = false;
        continue;
      }
    }
    inIndentedCode = false;

    // Reference definitions are collected but their lines are not linted.
    const refDef = REF_DEF_RE.exec(working);
    if (refDef) {
      const label = normalizeLabel(refDef[1]!);
      if (!refs.has(label)) refs.set(label, refDef[2] ?? refDef[3] ?? "");
      prevBlank = false;
      continue;
    }

    content[idx] = { line: lineNo, text: working, offset: workingOffset };
    prevBlank = false;
  }

  // ---- Pass B: block structures over the surviving content lines.
  const consumed = new Set<number>(); // indices consumed by setext underlines / delimiter rows

  for (let idx = 0; idx < lines.length; idx += 1) {
    const cur = content[idx];
    if (!cur || consumed.has(idx)) continue;
    const { text, offset, line } = cur;

    // ATX headings.
    const atx = ATX_RE.exec(text);
    if (atx) {
      let headingText = atx[2] ?? "";
      headingText = headingText.replace(/[ \t]+#+[ \t]*$/, "").trim();
      // "## #" is all closing sequence: an empty heading in CommonMark.
      if (/^#+$/.test(headingText)) headingText = "";
      doc.headings.push({
        level: atx[1]!.length,
        text: renderedInlineText(headingText),
        style: "atx",
        line,
        column: offset + text.indexOf("#") + 1,
      });
      scanLineInto(doc, headingText, line, offset + text.indexOf("#") + atx[1]!.length + 1, refs);
      continue;
    }

    // Setext headings: a paragraph line followed by === or ---.
    const next = content[idx + 1];
    if (
      next &&
      next.line === line + 1 &&
      SETEXT_UNDERLINE_RE.test(next.text) &&
      !THEMATIC_BREAK_RE.test(text) &&
      !LIST_ITEM_RE.test(text) &&
      !text.includes("|")
    ) {
      const underline = next.text.trim()[0];
      doc.headings.push({
        level: underline === "=" ? 1 : 2,
        text: renderedInlineText(text.trim()),
        style: "setext",
        line,
        column: offset + 1,
      });
      scanLineInto(doc, text, line, offset + 1, refs);
      consumed.add(idx + 1);
      continue;
    }

    // Thematic breaks are structure, not content.
    if (THEMATIC_BREAK_RE.test(text)) continue;

    // GFM pipe tables: header row + delimiter row.
    if (
      text.includes("|") &&
      next &&
      next.line === line + 1 &&
      next.text.includes("-") &&
      TABLE_DELIMITER_RE.test(next.text) &&
      next.text.includes("|")
    ) {
      const headerCells = splitTableRow(text, offset);
      doc.tables.push({
        kind: "pipe",
        headerCells,
        hasHeaderCells: headerCells.some((c) => c.text !== ""),
        presentational: false,
        line,
        column: offset + 1,
      });
      consumed.add(idx + 1);
      scanLineInto(doc, text, line, offset + 1, refs);
      continue;
    }
    if (TABLE_DELIMITER_RE.test(text) && text.includes("|")) continue; // stray delimiter

    // Bold paragraph used as a heading: standalone single line, entirely
    // strong, short, no terminal punctuation, no link inside.
    const trimmed = text.trim();
    const bold = BOLD_LINE_RE.exec(trimmed);
    const prevIsBlank = !content[idx - 1] || consumed.has(idx - 1);
    const nextIsBlank = !next || next.line !== line + 1;
    if (
      bold &&
      prevIsBlank &&
      nextIsBlank &&
      !/[.,;:!?]$/.test(bold[2]!) &&
      bold[2]!.length <= 80 &&
      !/\]\(/.test(bold[2]!) &&
      !bold[2]!.includes(bold[1]!)
    ) {
      doc.boldParagraphs.push({
        text: renderedInlineText(bold[2]!),
        line,
        column: offset + (text.length - text.trimStart().length) + 1,
      });
      // Still scan it: a bold line can contain an image.
    }

    scanLineInto(doc, text, line, offset + 1, refs);
  }

  return doc;
}

/** Strip emphasis markers for stored heading/paragraph text. */
function renderedInlineText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/[*`]/g, "")
    .replace(/(^|[^A-Za-z0-9])_+/g, "$1")
    .replace(/_+([^A-Za-z0-9]|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function scanLineInto(
  doc: ParsedDocument,
  text: string,
  line: number,
  colBase: number,
  refs: RefMap
): void {
  const result = scanInline(text, line, refs, colBase - 1);
  for (const image of result.images) doc.images.push(image);
  for (const link of result.links) doc.links.push(link);
}
