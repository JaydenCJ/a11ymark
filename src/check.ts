/**
 * The checker ties parsing, rules and suppressions together: source text in,
 * sorted diagnostics out. This is the main programmatic entry point — the
 * CLI is a thin wrapper that adds file discovery and rendering on top.
 */

import { parseMarkdown } from "./blocks.js";
import { runRules } from "./rules.js";
import type { CheckOptions, Diagnostic, ParsedDocument, Suppression } from "./types.js";

/** Result of checking one document. */
export interface CheckResult {
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
  /** Findings removed by inline `a11ymark-disable-*` directives. */
  suppressed: number;
}

function isSuppressed(diag: Diagnostic, suppressions: Suppression[]): boolean {
  for (const s of suppressions) {
    const codeMatch = s.codes === null || s.codes.includes(diag.code);
    if (!codeMatch) continue;
    if (s.kind === "file") return true;
    if (s.kind === "next-line" && diag.line === s.targetLine) return true;
  }
  return false;
}

/** Check an already-parsed document. */
export function checkDocument(doc: ParsedDocument, options: CheckOptions = {}): CheckResult {
  const raw = runRules(doc, options);
  const diagnostics: Diagnostic[] = [];
  let suppressed = 0;
  for (const diag of raw) {
    if (isSuppressed(diag, doc.suppressions)) suppressed += 1;
    else diagnostics.push(diag);
  }
  let errors = 0;
  let warnings = 0;
  for (const diag of diagnostics) {
    if (diag.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { diagnostics, errors, warnings, suppressed };
}

/** Parse and check Markdown source in one call. */
export function checkMarkdown(source: string, options: CheckOptions = {}): CheckResult {
  return checkDocument(parseMarkdown(source), options);
}
