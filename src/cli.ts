/**
 * CLI entry point — the only module that touches the filesystem or the
 * process. Everything it does is delegated to pure modules: argument
 * parsing (cliargs), checking (check) and rendering (report), so this file
 * stays a thin, boring shell.
 *
 * Exit codes: 0 clean, 1 findings (errors, or warnings under --strict),
 * 2 usage or I/O error — scripts can tell a failing document from a broken
 * invocation.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { checkMarkdown } from "./check.js";
import { parseCliArgs, USAGE } from "./cliargs.js";
import {
  renderJson,
  renderRulesJson,
  renderRulesText,
  renderText,
  type FileReport,
} from "./report.js";
import type { CheckOptions } from "./types.js";
import { VERSION } from "./version.js";

const MARKDOWN_EXTS = new Set([".md", ".markdown", ".mdown"]);

/** Directories that are never worth descending into. */
const SKIPPED_DIRS = new Set(["node_modules", ".git", "dist", "build", "vendor"]);

/**
 * Expand path arguments into a sorted list of Markdown files. Explicitly
 * named files are always accepted regardless of extension; directories are
 * walked recursively for Markdown extensions, skipping hidden and vendored
 * directories. Sorted so multi-file output is deterministic.
 */
export function discoverFiles(paths: string[]): { files: string[]; errors: string[] } {
  const files: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  const push = (file: string) => {
    if (!seen.has(file)) {
      seen.add(file);
      files.push(file);
    }
  };

  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      errors.push(`cannot read directory: ${dir}`);
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || SKIPPED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(full);
      else if (MARKDOWN_EXTS.has(extname(entry).toLowerCase())) push(full);
    }
  };

  for (const path of paths) {
    if (path === "-") {
      push("-");
      continue;
    }
    let stat;
    try {
      stat = statSync(path);
    } catch {
      errors.push(`no such file or directory: ${path}`);
      continue;
    }
    if (stat.isDirectory()) walk(path);
    else push(path);
  }
  return { files, errors };
}

/** Run the CLI. Returns the process exit code. */
export function runCli(argv: string[]): number {
  const parsed = parseCliArgs(argv);
  if ("error" in parsed) {
    process.stderr.write(`a11ymark: ${parsed.error}\n`);
    return 2;
  }

  if (parsed.command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (parsed.command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.command === "rules") {
    process.stdout.write(parsed.format === "json" ? renderRulesJson() : renderRulesText());
    return 0;
  }

  const { files, errors } = discoverFiles(parsed.paths);
  for (const message of errors) process.stderr.write(`a11ymark: ${message}\n`);
  if (errors.length > 0) return 2;
  if (files.length === 0) {
    process.stderr.write("a11ymark: no Markdown files found\n");
    return 2;
  }

  const options: CheckOptions = { disable: parsed.disable };
  if (parsed.maxAltLength !== null) options.maxAltLength = parsed.maxAltLength;

  const reports: FileReport[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
    } catch {
      process.stderr.write(`a11ymark: cannot read file: ${file}\n`);
      return 2;
    }
    const path = file === "-" ? "(stdin)" : file;
    reports.push({ path, result: checkMarkdown(source, options) });
  }

  const output =
    parsed.format === "json" ? renderJson(reports) : renderText(reports, { quiet: parsed.quiet });
  process.stdout.write(output);

  let errorCount = 0;
  let warningCount = 0;
  for (const report of reports) {
    errorCount += report.result.errors;
    warningCount += report.result.warnings;
  }
  if (errorCount > 0) return 1;
  if (parsed.strict && warningCount > 0) return 1;
  return 0;
}

process.exit(runCli(process.argv.slice(2)));
