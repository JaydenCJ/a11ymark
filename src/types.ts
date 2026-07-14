/**
 * Shared types for a11ymark. Everything downstream of the parser works on
 * these plain value shapes — rules never see file handles or raw text,
 * which keeps them pure and unit-testable.
 */

export type Severity = "error" | "warning";

/** One finding. `line`/`column` are 1-based positions in the source file. */
export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  line: number;
  column: number;
  /** Concrete, actionable fix suggestion. Present whenever one can be derived safely. */
  hint?: string;
}

/** Static metadata for a rule, used by `a11ymark rules` and docs. */
export interface RuleMeta {
  code: string;
  name: string;
  severity: Severity;
  summary: string;
  /** The WCAG success criterion this rule is derived from. */
  wcag: string;
}

/** An image found in the document (Markdown, reference-style or HTML). */
export interface ImageNode {
  kind: "markdown" | "reference" | "html";
  /** Rendered alternative text ("" when empty). */
  alt: string;
  /** False only for HTML `<img>` tags that omit the alt attribute entirely. */
  altProvided: boolean;
  /** True for HTML `<img alt="">` — an explicit "decorative" marker. */
  explicitlyDecorative: boolean;
  /** Resolved destination; "" when a reference label has no definition. */
  src: string;
  /** True when the image sits inside link content. */
  insideLink: boolean;
  /** True when the enclosing link has text besides this image's alt. */
  linkHasOtherText: boolean;
  line: number;
  column: number;
}

/** A link found in the document (inline, reference-style, autolink or HTML). */
export interface LinkNode {
  kind: "inline" | "reference" | "autolink" | "html";
  /** Rendered text content; images inside contribute their alt text. */
  text: string;
  /** Resolved destination. */
  href: string;
  /** Images that are part of the link content. */
  images: ImageNode[];
  line: number;
  column: number;
}

export interface HeadingNode {
  /** 1..6 */
  level: number;
  text: string;
  style: "atx" | "setext";
  line: number;
  column: number;
}

export interface TableCell {
  text: string;
  column: number;
}

/** A GFM pipe table (header row + delimiter row) or an HTML `<table>`. */
export interface TableNode {
  kind: "pipe" | "html";
  /** Header cells (pipe tables only; empty for HTML tables). */
  headerCells: TableCell[];
  /** True when an HTML table contains at least one `<th>`. */
  hasHeaderCells: boolean;
  /** True when an HTML table is marked role="presentation" (layout table). */
  presentational: boolean;
  line: number;
  column: number;
}

/** A standalone single-line paragraph that is entirely bold — a heading look-alike. */
export interface BoldParagraph {
  text: string;
  line: number;
  column: number;
}

/** An inline suppression directive parsed from an HTML comment. */
export interface Suppression {
  kind: "next-line" | "file";
  /** The 1-based line the directive covers (unused for `file`). */
  targetLine: number;
  /** Rule codes to suppress; null means all rules. */
  codes: string[] | null;
}

/** The fully parsed document model that every rule consumes. */
export interface ParsedDocument {
  headings: HeadingNode[];
  images: ImageNode[];
  links: LinkNode[];
  tables: TableNode[];
  boldParagraphs: BoldParagraph[];
  suppressions: Suppression[];
}

/** User-tunable options threaded from the CLI into the checker. */
export interface CheckOptions {
  /** Rule codes to switch off entirely. */
  disable?: string[];
  /** Maximum alt-text length before A105 fires (default 125). */
  maxAltLength?: number;
}
