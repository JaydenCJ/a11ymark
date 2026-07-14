/**
 * Inline scanner: extracts images and links from a single line of Markdown
 * content. The block scanner (blocks.ts) decides *which* lines reach this
 * module — code blocks, comments and front matter never do.
 *
 * The scanner is a hand-written character walk rather than a regex soup so
 * that nested brackets, escaped characters and inline code spans are handled
 * the way CommonMark renders them. It is deliberately line-scoped: multi-line
 * inline constructs (a link text wrapped across lines, a multi-line `<img>`
 * tag) are out of scope for 0.1.0 and documented as such in docs/rules.md.
 */

import type { ImageNode, LinkNode } from "./types.js";

/** Reference definitions collected by the block scanner: normalized label → destination. */
export type RefMap = Map<string, string>;

export interface InlineScanResult {
  images: ImageNode[];
  links: LinkNode[];
}

/** CommonMark label normalization: case-fold and collapse internal whitespace. */
export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Replace inline code spans with spaces so the main walk never sees their
 * contents, while preserving every character's column. A span opens with a
 * run of N backticks and closes at the next run of exactly N backticks;
 * unmatched runs stay as-is (they render literally).
 */
export function maskCodeSpans(line: string): string {
  const chars = line.split("");
  let i = 0;
  while (i < line.length) {
    if (chars[i] !== "`") {
      i += 1;
      continue;
    }
    let openLen = 0;
    while (chars[i + openLen] === "`") openLen += 1;
    // Search for a closing run of exactly openLen backticks.
    let j = i + openLen;
    let close = -1;
    while (j < line.length) {
      if (chars[j] === "`") {
        let runLen = 0;
        while (chars[j + runLen] === "`") runLen += 1;
        if (runLen === openLen) {
          close = j;
          break;
        }
        j += runLen;
      } else {
        j += 1;
      }
    }
    if (close === -1) {
      i += openLen;
      continue;
    }
    for (let k = i; k < close + openLen; k += 1) chars[k] = " ";
    i = close + openLen;
  }
  return chars.join("");
}

function isEscaped(line: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && line[i] === "\\"; i -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

/**
 * Parse a bracketed run starting at `open` (which must point at `[`).
 * Handles one level of nesting per bracket pair and backslash escapes.
 * Returns the content and the index of the closing `]`, or null.
 */
function parseBracketed(line: string, open: number): { content: string; close: number } | null {
  let depth = 0;
  for (let i = open; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return { content: line.slice(open + 1, i), close: i };
    }
  }
  return null;
}

/**
 * Parse an inline destination `(url "title")` starting at `open` (a `(`).
 * Supports the `<...>` form and balanced parentheses in bare destinations.
 * Returns the destination and the index of the closing `)`, or null.
 */
function parseDestination(line: string, open: number): { dest: string; close: number } | null {
  let i = open + 1;
  while (line[i] === " " || line[i] === "\t") i += 1;
  if (line[i] === "<") {
    const end = line.indexOf(">", i + 1);
    if (end === -1) return null;
    const dest = line.slice(i + 1, end);
    const close = line.indexOf(")", end + 1);
    if (close === -1) return null;
    return { dest, close };
  }
  let depth = 1;
  let destEnd = -1;
  let j = i;
  for (; j < line.length; j += 1) {
    const ch = line[j];
    if (ch === "\\") {
      j += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) break;
    } else if ((ch === " " || ch === "\t") && depth === 1 && destEnd === -1) {
      destEnd = j;
    }
  }
  if (j >= line.length) return null;
  const dest = line.slice(i, destEnd === -1 ? j : destEnd).trim();
  return { dest, close: j };
}

/**
 * Strip emphasis/code markers and collapse whitespace for rendered text.
 * Intraword underscores (`IMG_4021`, `snake_case`) are literal in CommonMark,
 * so only underscores at a word edge are treated as emphasis markers.
 */
export function renderedText(raw: string): string {
  return raw
    .replace(/\\([\\`*_{}[\]()#+\-.!<>|])/g, "$1")
    .replace(/[*`]/g, "")
    .replace(/(^|[^A-Za-z0-9])_+/g, "$1")
    .replace(/_+([^A-Za-z0-9]|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const HTML_IMG_RE = /<img\b[^>]*>/gi;
const HTML_ANCHOR_RE = /<a\b[^>]*>([^<]*)<\/a>/gi;
const AUTOLINK_RE = /<((?:https?|ftp):\/\/[^\s<>]+|mailto:[^\s<>]+)>/gi;

function htmlAttribute(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = re.exec(tag);
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? "";
}

interface ParsedImage {
  node: ImageNode;
  /** Index just past the construct, for the main walk to resume from. */
  end: number;
}

/**
 * Parse a Markdown image starting at `start` (pointing at `!`). Structure is
 * read from the masked `line`; the alt text is sliced out of `raw` so that
 * code spans inside an alt survive (masking is column-preserving).
 */
function parseMarkdownImage(
  line: string,
  raw: string,
  start: number,
  lineNo: number,
  colOffset: number,
  refs: RefMap
): ParsedImage | null {
  const bracket = parseBracketed(line, start + 1);
  if (!bracket) return null;
  const alt = renderedText(raw.slice(start + 2, bracket.close));
  const after = bracket.close + 1;
  const base = {
    alt,
    altProvided: true,
    explicitlyDecorative: false,
    insideLink: false,
    linkHasOtherText: false,
    line: lineNo,
    column: colOffset + start + 1,
  };
  if (line[after] === "(") {
    const dest = parseDestination(line, after);
    if (!dest) return null;
    return { node: { kind: "markdown", src: dest.dest, ...base }, end: dest.close + 1 };
  }
  if (line[after] === "[") {
    const ref = parseBracketed(line, after);
    if (!ref) return null;
    const label = normalizeLabel(ref.content === "" ? bracket.content : ref.content);
    const src = refs.get(label);
    if (src === undefined) return null; // no definition → renders as literal text
    return { node: { kind: "reference", src, ...base }, end: ref.close + 1 };
  }
  // Shortcut reference: ![label]
  const src = refs.get(normalizeLabel(bracket.content));
  if (src === undefined) return null;
  return { node: { kind: "reference", src, ...base }, end: after };
}

/**
 * Scan one content line. `colOffset` shifts reported columns so that lines
 * with stripped blockquote markers still point into the original source.
 */
export function scanInline(
  rawLine: string,
  lineNo: number,
  refs: RefMap,
  colOffset = 0
): InlineScanResult {
  const line = maskCodeSpans(rawLine);
  const images: ImageNode[] = [];
  const links: LinkNode[] = [];

  // Pass 1: HTML constructs and autolinks (masked afterwards so the Markdown
  // walk cannot re-match inside them).
  const masked = line.split("");
  const maskRange = (from: number, to: number) => {
    for (let k = from; k < to; k += 1) masked[k] = " ";
  };

  for (const match of line.matchAll(HTML_IMG_RE)) {
    const tag = match[0];
    const at = match.index;
    const alt = htmlAttribute(tag, "alt");
    images.push({
      kind: "html",
      alt: alt === null ? "" : alt.replace(/\s+/g, " ").trim(),
      altProvided: alt !== null,
      explicitlyDecorative: alt !== null && alt.trim() === "",
      src: htmlAttribute(tag, "src") ?? "",
      insideLink: false,
      linkHasOtherText: false,
      line: lineNo,
      column: colOffset + at + 1,
    });
    maskRange(at, at + tag.length);
  }

  for (const match of line.matchAll(HTML_ANCHOR_RE)) {
    const at = match.index;
    const openTag = match[0].slice(0, match[0].indexOf(">") + 1);
    links.push({
      kind: "html",
      text: (match[1] ?? "").replace(/\s+/g, " ").trim(),
      href: htmlAttribute(openTag, "href") ?? "",
      images: [],
      line: lineNo,
      column: colOffset + at + 1,
    });
    maskRange(at, at + match[0].length);
  }

  for (const match of line.matchAll(AUTOLINK_RE)) {
    const at = match.index;
    const target = match[1] ?? "";
    links.push({
      kind: "autolink",
      text: target,
      href: target,
      images: [],
      line: lineNo,
      column: colOffset + at + 1,
    });
    maskRange(at, at + match[0].length);
  }

  const walkLine = masked.join("");

  // Pass 2: Markdown images and links.
  let i = 0;
  while (i < walkLine.length) {
    const ch = walkLine[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "!" && walkLine[i + 1] === "[" && !isEscaped(walkLine, i)) {
      const image = parseMarkdownImage(walkLine, rawLine, i, lineNo, colOffset, refs);
      if (image) {
        images.push(image.node);
        i = image.end;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === "[" && !isEscaped(walkLine, i)) {
      const bracket = parseBracketed(walkLine, i);
      if (!bracket) {
        i += 1;
        continue;
      }
      const after = bracket.close + 1;
      let href: string | null = null;
      let kind: LinkNode["kind"] = "inline";
      let end = after;
      if (walkLine[after] === "(") {
        const dest = parseDestination(walkLine, after);
        if (dest) {
          href = dest.dest;
          end = dest.close + 1;
        }
      } else if (walkLine[after] === "[") {
        const ref = parseBracketed(walkLine, after);
        if (ref) {
          const label = normalizeLabel(ref.content === "" ? bracket.content : ref.content);
          const resolved = refs.get(label);
          if (resolved !== undefined) {
            href = resolved;
            kind = "reference";
            end = ref.close + 1;
          }
        }
      } else {
        const resolved = refs.get(normalizeLabel(bracket.content));
        if (resolved !== undefined) {
          href = resolved;
          kind = "reference";
          end = after;
        }
      }
      if (href === null) {
        i += 1;
        continue;
      }
      // Extract images nested in the link content, then compute rendered text.
      // Structure comes from the masked content; the visible text is sliced
      // from the raw line so code spans inside link text are preserved.
      const innerImages: ImageNode[] = [];
      const inner = scanInline(bracket.content, lineNo, refs, colOffset + i + 1);
      for (const img of inner.images) innerImages.push(img);
      let textOnly = rawLine.slice(i + 1, bracket.close);
      // Remove image constructs from the text before rendering.
      textOnly = textOnly.replace(/!\[([^\]]*)\]\([^)]*\)/g, " ");
      textOnly = textOnly.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, " ");
      textOnly = textOnly.replace(/<img\b[^>]*>/gi, " ");
      const plainText = renderedText(textOnly);
      const altText = innerImages.map((img) => img.alt).join(" ").trim();
      const combined = renderedText(`${plainText} ${altText}`);
      for (const img of innerImages) {
        img.insideLink = true;
        img.linkHasOtherText = plainText.length > 0;
        images.push(img);
      }
      links.push({
        kind,
        text: combined,
        href,
        images: innerImages,
        line: lineNo,
        column: colOffset + i + 1,
      });
      i = end;
      continue;
    }
    i += 1;
  }

  images.sort((a, b) => a.column - b.column);
  links.sort((a, b) => a.column - b.column);
  return { images, links };
}
