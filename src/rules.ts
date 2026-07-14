/**
 * The rule catalog. Each rule is a pure function from the parsed document
 * model to diagnostics — no I/O, no state, no ordering dependencies between
 * rules. Codes are stable API: never renumber or repurpose one.
 *
 * Numbering scheme: A1xx = images/alt text, A11x = links, A12x = headings,
 * A13x = tables. Every rule cites the WCAG success criterion it is derived
 * from; the full rationale per rule lives in docs/rules.md.
 */

import type {
  CheckOptions,
  Diagnostic,
  HeadingNode,
  ImageNode,
  LinkNode,
  ParsedDocument,
  RuleMeta,
} from "./types.js";

export const DEFAULT_MAX_ALT_LENGTH = 125;

/** Static rule table, consumed by `a11ymark rules` and docs/rules.md. */
export const RULES: RuleMeta[] = [
  {
    code: "A101",
    name: "missing-alt-text",
    severity: "error",
    summary: "Image has no alternative text",
    wcag: "1.1.1",
  },
  {
    code: "A102",
    name: "placeholder-alt-text",
    severity: "error",
    summary: "Alt text is a placeholder word or a filename",
    wcag: "1.1.1",
  },
  {
    code: "A103",
    name: "redundant-alt-prefix",
    severity: "warning",
    summary: 'Alt text starts with "image of" or similar',
    wcag: "1.1.1",
  },
  {
    code: "A104",
    name: "image-link-no-text",
    severity: "error",
    summary: "Link contains only an image with no alt text",
    wcag: "2.4.4",
  },
  {
    code: "A105",
    name: "alt-text-too-long",
    severity: "warning",
    summary: "Alt text exceeds the length budget",
    wcag: "1.1.1",
  },
  {
    code: "A110",
    name: "generic-link-text",
    severity: "error",
    summary: 'Link text is generic ("click here", "read more", …)',
    wcag: "2.4.4",
  },
  {
    code: "A111",
    name: "url-as-link-text",
    severity: "warning",
    summary: "Raw URL used as link text",
    wcag: "2.4.4",
  },
  {
    code: "A112",
    name: "empty-link-text",
    severity: "error",
    summary: "Link has no text content at all",
    wcag: "2.4.4",
  },
  {
    code: "A113",
    name: "ambiguous-link-text",
    severity: "warning",
    summary: "Same link text points at different destinations",
    wcag: "2.4.4",
  },
  {
    code: "A120",
    name: "skipped-heading-level",
    severity: "error",
    summary: "Heading level jumps by more than one",
    wcag: "1.3.1",
  },
  {
    code: "A121",
    name: "first-heading-not-h1",
    severity: "warning",
    summary: "Document does not start with a level-1 heading",
    wcag: "1.3.1",
  },
  {
    code: "A122",
    name: "multiple-h1",
    severity: "warning",
    summary: "More than one level-1 heading",
    wcag: "1.3.1",
  },
  {
    code: "A123",
    name: "empty-heading",
    severity: "error",
    summary: "Heading has no text",
    wcag: "2.4.6",
  },
  {
    code: "A124",
    name: "bold-as-heading",
    severity: "warning",
    summary: "Bold paragraph used where a heading belongs",
    wcag: "1.3.1",
  },
  {
    code: "A130",
    name: "table-missing-header",
    severity: "error",
    summary: "Table has no header cells",
    wcag: "1.3.1",
  },
  {
    code: "A131",
    name: "empty-header-cell",
    severity: "warning",
    summary: "Table header row has an unnamed column",
    wcag: "1.3.1",
  },
];

const RULE_BY_CODE = new Map(RULES.map((r) => [r.code, r]));

export function ruleMeta(code: string): RuleMeta | undefined {
  return RULE_BY_CODE.get(code);
}

function make(code: string, message: string, line: number, column: number, hint?: string): Diagnostic {
  const meta = RULE_BY_CODE.get(code);
  if (!meta) throw new Error(`unknown rule code ${code}`);
  const diag: Diagnostic = { code, severity: meta.severity, message, line, column };
  if (hint !== undefined) diag.hint = hint;
  return diag;
}

// ---------------------------------------------------------------------------
// Alt-text rules (A10x)
// ---------------------------------------------------------------------------

/**
 * Bare placeholder words that carry zero information for a screen-reader
 * user. Matched against the whole alt text, case-insensitively, after
 * trimming punctuation — "Image." is as empty as "image".
 */
const PLACEHOLDER_ALTS = new Set([
  "image",
  "img",
  "photo",
  "photograph",
  "picture",
  "pic",
  "screenshot",
  "screen shot",
  "graphic",
  "graph",
  "icon",
  "logo",
  "banner",
  "figure",
  "diagram",
  "chart",
  "thumbnail",
  "untitled",
  "alt",
  "alt text",
  "placeholder",
  "todo",
  "tbd",
  "fixme",
  "xxx",
]);

/** Camera-roll style names: IMG_1234, DSC0042, Screenshot 2026-07-04, photo-2. */
const CAMERA_NAME_RE = /^(img|image|dsc|dscn|pic|photo|screenshot|screen shot|capture)[-_ ]?[\d\-_. ]*$/i;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif|tiff?|ico)$/i;

const REDUNDANT_PREFIX_RE =
  /^(an? )?(image|picture|photo|photograph|screenshot|screen shot|graphic|icon|illustration)( of| showing| shows| depicting)\b/i;

function normalizeAlt(alt: string): string {
  return alt.trim().replace(/[.,:;!?]+$/, "").trim().toLowerCase();
}

function srcBasename(src: string): string {
  const noQuery = src.split(/[?#]/, 1)[0] ?? "";
  const parts = noQuery.split("/");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

/** True when the alt text is a placeholder word, a camera name or a filename. */
export function isPlaceholderAlt(alt: string, src: string): boolean {
  const normalized = normalizeAlt(alt);
  if (normalized === "") return false; // empty alt is A101's business
  if (PLACEHOLDER_ALTS.has(normalized)) return true;
  if (CAMERA_NAME_RE.test(normalized)) return true;
  if (IMAGE_EXT_RE.test(normalized)) return true;
  const base = srcBasename(src);
  if (base !== "" && (normalized === base || normalized === base.replace(IMAGE_EXT_RE, ""))) {
    return true;
  }
  return false;
}

function checkImage(image: ImageNode, maxAlt: number, out: Diagnostic[]): void {
  // Explicit `<img alt="">` is the documented way to mark decoration — allowed.
  if (image.explicitlyDecorative) return;

  const empty = !image.altProvided || image.alt === "";
  if (empty) {
    // An image that is a link's only content is reported as A104 on the link
    // (the failure is a nameless link, which is the more severe framing).
    if (image.insideLink && !image.linkHasOtherText) return;
    const hint =
      image.kind === "html"
        ? 'describe the image in an alt attribute, or mark it decorative with alt=""'
        : "describe the image: ![Bar chart of Q3 sign-ups by region](chart.png)";
    out.push(make("A101", "image has no alt text", image.line, image.column, hint));
    return;
  }

  if (isPlaceholderAlt(image.alt, image.src)) {
    out.push(
      make(
        "A102",
        `alt text ${JSON.stringify(image.alt)} is a placeholder, not a description`,
        image.line,
        image.column,
        "say what the image shows, not what it is: ![Terminal running the installer](setup.png)"
      )
    );
    return;
  }

  const prefix = REDUNDANT_PREFIX_RE.exec(image.alt);
  if (prefix) {
    out.push(
      make(
        "A103",
        `alt text starts with ${JSON.stringify(prefix[0].trim())} — screen readers already announce images`,
        image.line,
        image.column,
        `drop the prefix: ${JSON.stringify(image.alt.slice(prefix[0].length).trimStart() || "…")}`
      )
    );
  }

  if (image.alt.length > maxAlt) {
    out.push(
      make(
        "A105",
        `alt text is ${image.alt.length} characters (limit ${maxAlt})`,
        image.line,
        image.column,
        "keep alt text short; move the detail into the surrounding prose or a caption"
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Link rules (A11x)
// ---------------------------------------------------------------------------

/**
 * Link texts that describe the act of clicking instead of the destination.
 * WCAG 2.4.4 requires the purpose of a link to be determinable from its
 * text; every entry here fails that test when read out of context, which is
 * exactly how screen-reader users navigate (tabbing through a links list).
 */
const GENERIC_LINK_TEXTS = new Set([
  "click here",
  "click",
  "here",
  "tap here",
  "click this link",
  "this link",
  "this",
  "this page",
  "this article",
  "this post",
  "link",
  "the link",
  "read more",
  "more",
  "learn more",
  "see more",
  "more info",
  "more information",
  "more details",
  "details",
  "info",
  "continue",
  "continue reading",
  "go",
  "go here",
  "start here",
  "see here",
  "check it out",
  "find out more",
  "download",
  "website",
  "page",
]);

function normalizeLinkText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,:;!?…»›→>-]+$/g, "")
    .replace(/^[«‹→<-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the link text is on the generic-phrase blocklist. */
export function isGenericLinkText(text: string): boolean {
  return GENERIC_LINK_TEXTS.has(normalizeLinkText(text));
}

const URL_TEXT_RE = /^(https?:\/\/|www\.)\S+$/i;

/** True when the visible text is a raw URL a screen reader would spell out. */
export function isUrlLinkText(text: string): boolean {
  return URL_TEXT_RE.test(text.trim());
}

function checkLink(link: LinkNode, out: Diagnostic[]): void {
  if (link.text === "") {
    if (link.images.length > 0) {
      out.push(
        make(
          "A104",
          "link contains only an image with no alt text — the link has no accessible name",
          link.line,
          link.column,
          "give the image alt text naming the destination: [![Project logo](logo.svg)](https://example.test)"
        )
      );
    } else {
      out.push(
        make(
          "A112",
          "link has no text — screen readers announce it as just \"link\"",
          link.line,
          link.column,
          "add text naming the destination, or remove the link"
        )
      );
    }
    return;
  }

  if (isGenericLinkText(link.text)) {
    out.push(
      make(
        "A110",
        `link text ${JSON.stringify(link.text)} does not describe the destination`,
        link.line,
        link.column,
        "name the destination: [installation guide](docs/install.md), not [click here](docs/install.md)"
      )
    );
    return;
  }

  // mailto autolinks are exempt: an email address is its own best name.
  if (isUrlLinkText(link.text) && !link.href.startsWith("mailto:")) {
    out.push(
      make(
        "A111",
        "raw URL as link text — screen readers read it out character by character",
        link.line,
        link.column,
        `use the page title as text: [Example docs](${link.href || link.text})`
      )
    );
  }
}

function checkAmbiguousLinks(links: LinkNode[], out: Diagnostic[]): void {
  const byText = new Map<string, LinkNode[]>();
  for (const link of links) {
    const key = normalizeLinkText(link.text);
    if (key === "" || GENERIC_LINK_TEXTS.has(key) || URL_TEXT_RE.test(key)) continue;
    const bucket = byText.get(key);
    if (bucket) bucket.push(link);
    else byText.set(key, [link]);
  }
  for (const [, group] of byText) {
    const hrefs = new Set(group.map((l) => l.href));
    if (hrefs.size < 2) continue;
    const first = group[0]!;
    for (const link of group.slice(1)) {
      if (link.href === first.href) continue;
      out.push(
        make(
          "A113",
          `link text ${JSON.stringify(link.text)} was already used for a different destination (line ${first.line})`,
          link.line,
          link.column,
          "links with the same text should go to the same place; differentiate the texts otherwise"
        )
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Heading rules (A12x)
// ---------------------------------------------------------------------------

function checkHeadings(headings: HeadingNode[], out: Diagnostic[]): void {
  let prevLevel = 0;
  let h1Seen = false;
  for (const heading of headings) {
    if (heading.text === "") {
      out.push(
        make(
          "A123",
          "heading has no text",
          heading.line,
          heading.column,
          "give the heading text, or delete it"
        )
      );
    }
    if (prevLevel === 0 && heading.level !== 1) {
      out.push(
        make(
          "A121",
          `first heading is level ${heading.level} — documents should start at level 1`,
          heading.line,
          heading.column,
          `make it a level-1 heading: # ${heading.text || "…"}`
        )
      );
    }
    if (prevLevel > 0 && heading.level > prevLevel + 1) {
      out.push(
        make(
          "A120",
          `heading level jumps from ${prevLevel} to ${heading.level} — skipped level ${prevLevel + 1}`,
          heading.line,
          heading.column,
          `use ${"#".repeat(prevLevel + 1)} (level ${prevLevel + 1}) so the outline stays navigable`
        )
      );
    }
    if (heading.level === 1) {
      if (h1Seen) {
        out.push(
          make(
            "A122",
            "more than one level-1 heading — the document title should be unique",
            heading.line,
            heading.column,
            "demote this to level 2 (##) or split the document"
          )
        );
      }
      h1Seen = true;
    }
    prevLevel = heading.level;
  }
}

// ---------------------------------------------------------------------------
// Assemble: run everything over a parsed document.
// ---------------------------------------------------------------------------

/** Run every rule over a parsed document. Suppressions are applied by the caller. */
export function runRules(doc: ParsedDocument, options: CheckOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const maxAlt = options.maxAltLength ?? DEFAULT_MAX_ALT_LENGTH;

  for (const image of doc.images) checkImage(image, maxAlt, out);
  for (const link of doc.links) checkLink(link, out);
  checkAmbiguousLinks(doc.links, out);
  checkHeadings(doc.headings, out);

  for (const para of doc.boldParagraphs) {
    out.push(
      make(
        "A124",
        `bold paragraph ${JSON.stringify(para.text)} looks like a heading but is invisible to the document outline`,
        para.line,
        para.column,
        `make it a real heading: ## ${para.text}`
      )
    );
  }

  for (const table of doc.tables) {
    if (table.presentational) continue;
    if (!table.hasHeaderCells) {
      const hint =
        table.kind === "html"
          ? "mark the header cells with <th> (or role=\"presentation\" for a layout table)"
          : "name every column in the header row";
      out.push(make("A130", "table has no header cells", table.line, table.column, hint));
      continue;
    }
    for (const cell of table.headerCells) {
      if (cell.text === "") {
        out.push(
          make(
            "A131",
            "table header row has an unnamed column",
            table.line,
            cell.column,
            "give every column a header — screen readers announce it with each cell"
          )
        );
      }
    }
  }

  const disabled = new Set(options.disable ?? []);
  const kept = disabled.size === 0 ? out : out.filter((d) => !disabled.has(d.code));
  kept.sort((a, b) => a.line - b.line || a.column - b.column || (a.code < b.code ? -1 : 1));
  return kept;
}
