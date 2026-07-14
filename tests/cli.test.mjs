// CLI integration: the real dist/cli.js in a subprocess, exercising file
// discovery, stdin, exit codes and both output formats. Everything runs
// against the bundled examples or fresh temp trees — no network, no state.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runCli, tempTree } from "./helpers.mjs";

test("--version prints the package.json version; --help documents the surface", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const version = runCli(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), pkg.version);
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  for (const word of ["check", "rules", "--strict", "--disable", "--format", "Exit codes"]) {
    assert.ok(help.stdout.includes(word), `help missing ${word}`);
  }
});

test("bundled examples: clean.md exits 0, flawed.md exits 1 with the seeded counts", () => {
  const clean = runCli(["check", "examples/clean.md"]);
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /examples\/clean\.md: OK \(0 errors, 0 warnings\)/);
  const { status, stdout } = runCli(["check", "examples/flawed.md"]);
  assert.equal(status, 1);
  assert.match(stdout, /FAIL \(6 errors, 6 warnings, 1 suppressed\)/);
  for (const code of ["A101", "A102", "A110", "A104", "A120", "A130"]) {
    assert.ok(stdout.includes(code), `report missing ${code}`);
  }
});

test("warnings alone exit 0 by default and 1 under --strict", () => {
  const { dir, cleanup } = tempTree({ "warn.md": "# T\n\nSee <https://example.test/docs>\n" });
  try {
    assert.equal(runCli(["check", `${dir}/warn.md`]).status, 0);
    assert.equal(runCli(["check", `${dir}/warn.md`, "--strict"]).status, 1);
  } finally {
    cleanup();
  }
});

test("directory arguments walk recursively, skip vendored/hidden dirs, sort output", () => {
  const { dir, cleanup } = tempTree({
    "b/two.md": "![](x.png)\n",
    "a/one.markdown": "# ok\n",
    "node_modules/pkg/skip.md": "![](skipped.png)\n",
    ".hidden/skip.md": "![](skipped.png)\n",
    "notes.txt": "![](not-markdown.png)\n",
  });
  try {
    const { status, stdout } = runCli(["check", dir]);
    assert.equal(status, 1);
    assert.match(stdout, /2 files checked: 1 error, 0 warnings/);
    assert.ok(stdout.indexOf("one.markdown") < stdout.indexOf("two.md"), "output not sorted");
    assert.equal(stdout.includes("skipped"), false);
  } finally {
    cleanup();
  }
});

test("stdin via '-' is checked and reported as (stdin)", () => {
  const { status, stdout } = runCli(["check", "-"], { input: "![](x.png)\n" });
  assert.equal(status, 1);
  assert.match(stdout, /\(stdin\):1:1 {2}error A101/);
});

test("--format json emits valid JSON with the documented shape", () => {
  const { status, stdout } = runCli(["check", "examples/flawed.md", "--format", "json"]);
  assert.equal(status, 1);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.tool, "a11ymark");
  assert.equal(parsed.summary.errors, 6);
  assert.equal(parsed.files[0].suppressed, 1);
});

test("--disable removes findings and can flip the exit code", () => {
  const { dir, cleanup } = tempTree({ "d.md": "# T\n\n[click here](x.md)\n" });
  try {
    assert.equal(runCli(["check", `${dir}/d.md`]).status, 1);
    const { status, stdout } = runCli(["check", `${dir}/d.md`, "--disable", "A110"]);
    assert.equal(status, 0);
    assert.equal(stdout.includes("A110"), false);
  } finally {
    cleanup();
  }
});

test("--max-alt-length tightens A105", () => {
  const { dir, cleanup } = tempTree({ "alt.md": "# T\n\n![A modest description](x.png)\n" });
  try {
    assert.equal(runCli(["check", `${dir}/alt.md`]).status, 0);
    const strictRun = runCli(["check", `${dir}/alt.md`, "--max-alt-length", "5", "--strict"]);
    assert.equal(strictRun.status, 1);
    assert.match(strictRun.stdout, /A105/);
  } finally {
    cleanup();
  }
});

test("usage errors exit 2, distinct from lint failures", () => {
  const missing = runCli(["check", "no-such-file.md"]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /no such file/);
  const badFlag = runCli(["--frobnicate"]);
  assert.equal(badFlag.status, 2);
  assert.match(badFlag.stderr, /unknown option/);
});

test("rules command lists the catalog; --format json parses to 16 rules", () => {
  const text = runCli(["rules"]);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /A101 {2}error/);
  assert.match(text.stdout, /WCAG 2\.4\.4/);
  const json = runCli(["rules", "--format", "json"]);
  assert.equal(JSON.parse(json.stdout).rules.length, 16);
});

test("repeat runs over the same input are byte-identical", () => {
  const first = runCli(["check", "examples/flawed.md"]);
  const second = runCli(["check", "examples/flawed.md"]);
  assert.equal(first.stdout, second.stdout);
});
