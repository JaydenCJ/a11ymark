/**
 * Public programmatic API. Everything exported here is stable within a
 * minor version; the CLI is built entirely on top of these functions, so
 * anything the CLI can do, a script can do without spawning a process.
 */

export { parseMarkdown, splitTableRow } from "./blocks.js";
export { maskCodeSpans, normalizeLabel, renderedText, scanInline } from "./inline.js";
export {
  DEFAULT_MAX_ALT_LENGTH,
  RULES,
  isGenericLinkText,
  isPlaceholderAlt,
  isUrlLinkText,
  ruleMeta,
  runRules,
} from "./rules.js";
export { checkDocument, checkMarkdown, type CheckResult } from "./check.js";
export {
  renderJson,
  renderRulesJson,
  renderRulesText,
  renderText,
  type FileReport,
  type RenderOptions,
} from "./report.js";
export { parseCliArgs, USAGE, type CliOptions, type CliParseError } from "./cliargs.js";
export type {
  BoldParagraph,
  CheckOptions,
  Diagnostic,
  HeadingNode,
  ImageNode,
  LinkNode,
  ParsedDocument,
  RuleMeta,
  Severity,
  Suppression,
  TableCell,
  TableNode,
} from "./types.js";
export { VERSION } from "./version.js";
