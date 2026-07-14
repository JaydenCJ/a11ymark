/**
 * Renderers: turn per-file check results into the text report humans read
 * and the JSON report CI consumes. Pure string builders — the CLI decides
 * where the output goes. Both formats are deterministic: same input, same
 * bytes, so reports can be snapshotted and diffed.
 */

import { RULES } from "./rules.js";
import type { CheckResult } from "./check.js";
import type { RuleMeta } from "./types.js";
import { VERSION } from "./version.js";

/** One checked file, ready to render. */
export interface FileReport {
  path: string;
  result: CheckResult;
}

export interface RenderOptions {
  /** Summary lines only — individual findings are omitted. */
  quiet?: boolean;
}

/** "1 error", "2 errors" — counts read like prose, never "1 error(s)". */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function fileSummary(report: FileReport): string {
  const { errors, warnings, suppressed } = report.result;
  const verdict = errors > 0 ? "FAIL" : "OK";
  const parts = [count(errors, "error"), count(warnings, "warning")];
  if (suppressed > 0) parts.push(`${suppressed} suppressed`);
  return `${report.path}: ${verdict} (${parts.join(", ")})`;
}

/** Render the human-readable text report for a set of files. */
export function renderText(reports: FileReport[], options: RenderOptions = {}): string {
  const lines: string[] = [];
  for (const report of reports) {
    if (!options.quiet) {
      for (const diag of report.result.diagnostics) {
        const where = `${diag.line}:${diag.column}`;
        lines.push(
          `${report.path}:${where}  ${diag.severity} ${diag.code}  ${diag.message}`
        );
        if (diag.hint) lines.push(`    fix: ${diag.hint}`);
      }
      if (report.result.diagnostics.length > 0) lines.push("");
    }
    lines.push(fileSummary(report));
  }
  if (reports.length > 1) {
    let errors = 0;
    let warnings = 0;
    for (const report of reports) {
      errors += report.result.errors;
      warnings += report.result.warnings;
    }
    lines.push("");
    lines.push(
      `${count(reports.length, "file")} checked: ${count(errors, "error")}, ${count(warnings, "warning")}`
    );
  }
  return lines.join("\n") + "\n";
}

/** Render the machine-readable JSON report (stable shape, documented in the README). */
export function renderJson(reports: FileReport[]): string {
  let errors = 0;
  let warnings = 0;
  for (const report of reports) {
    errors += report.result.errors;
    warnings += report.result.warnings;
  }
  const payload = {
    tool: "a11ymark",
    version: VERSION,
    files: reports.map((report) => ({
      path: report.path,
      errors: report.result.errors,
      warnings: report.result.warnings,
      suppressed: report.result.suppressed,
      diagnostics: report.result.diagnostics,
    })),
    summary: { files: reports.length, errors, warnings },
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

/** Render the rule catalog as an aligned text table. */
export function renderRulesText(rules: RuleMeta[] = RULES): string {
  const rows = rules.map((r) => [r.code, r.severity, `WCAG ${r.wcag}`, r.summary]);
  const widths = [0, 0, 0];
  for (const row of rows) {
    for (let i = 0; i < 3; i += 1) widths[i] = Math.max(widths[i]!, row[i]!.length);
  }
  const lines = rows.map((row) =>
    [row[0]!.padEnd(widths[0]!), row[1]!.padEnd(widths[1]!), row[2]!.padEnd(widths[2]!), row[3]!].join("  ")
  );
  return lines.join("\n") + "\n";
}

/** Render the rule catalog as JSON. */
export function renderRulesJson(rules: RuleMeta[] = RULES): string {
  return JSON.stringify({ tool: "a11ymark", version: VERSION, rules }, null, 2) + "\n";
}
