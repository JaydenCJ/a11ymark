// Shared factories for the test suite. Everything is deterministic and
// in-memory; CLI tests create their own temp dirs and clean up after.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { checkMarkdown } from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CLI = join(ROOT, "dist", "cli.js");

/** Check a Markdown string and return just the diagnostic codes, in order. */
export function codes(source, options = {}) {
  return checkMarkdown(source, options).diagnostics.map((d) => d.code);
}

/** Check a Markdown string and return the full diagnostics. */
export function diags(source, options = {}) {
  return checkMarkdown(source, options).diagnostics;
}

/** Run the built CLI in a subprocess. Returns { status, stdout, stderr }. */
export function runCli(args, { input } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    input,
    cwd: ROOT,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Create a temp dir with the given { relativePath: content } files. */
export function tempTree(files) {
  const dir = mkdtempSync(join(tmpdir(), "a11ymark-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
