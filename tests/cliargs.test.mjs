// Argument parsing. Unknown flags and bad values must be loud errors —
// a typo'd --disable silently checking nothing would defeat the tool.
import test from "node:test";
import assert from "node:assert/strict";

import { parseCliArgs } from "../dist/index.js";

test("bare paths default to check; explicit 'check' also works, even on a file named check", () => {
  assert.deepEqual(parseCliArgs(["README.md", "docs"]).paths, ["README.md", "docs"]);
  assert.equal(parseCliArgs(["README.md"]).command, "check");
  assert.deepEqual(parseCliArgs(["check", "check"]).paths, ["check"]);
});

test("rules command takes no paths", () => {
  assert.equal(parseCliArgs(["rules"]).command, "rules");
  assert.match(parseCliArgs(["rules", "x.md"]).error, /takes no paths/);
});

test("--format validates its value and requires one", () => {
  assert.equal(parseCliArgs(["a.md", "--format", "json"]).format, "json");
  assert.match(parseCliArgs(["a.md", "--format", "xml"]).error, /--format/);
  assert.match(parseCliArgs(["a.md", "--format"]).error, /requires a value/);
});

test("--disable accepts comma lists and repeats, uppercases codes, rejects unknown ones", () => {
  const opts = parseCliArgs(["a.md", "--disable", "a103,A111", "--disable", "A124"]);
  assert.deepEqual(opts.disable, ["A103", "A111", "A124"]);
  assert.match(parseCliArgs(["a.md", "--disable", "A999"]).error, /unknown rule code "A999"/);
});

test("--max-alt-length must be a positive integer", () => {
  assert.equal(parseCliArgs(["a.md", "--max-alt-length", "80"]).maxAltLength, 80);
  assert.match(parseCliArgs(["a.md", "--max-alt-length", "0"]).error, /positive integer/);
  assert.match(parseCliArgs(["a.md", "--max-alt-length", "many"]).error, /positive integer/);
});

test("unknown flags are errors; '-' alone is stdin, not a flag", () => {
  assert.match(parseCliArgs(["--frobnicate"]).error, /unknown option/);
  assert.deepEqual(parseCliArgs(["-"]).paths, ["-"]);
});

test("help and version short-circuit; no paths at all is a usage error", () => {
  assert.equal(parseCliArgs(["--help"]).command, "help");
  assert.equal(parseCliArgs(["a.md", "-v"]).command, "version");
  assert.match(parseCliArgs([]).error, /no input files/);
});

test("--strict and --quiet flags are recorded", () => {
  const opts = parseCliArgs(["a.md", "--strict", "-q"]);
  assert.equal(opts.strict, true);
  assert.equal(opts.quiet, true);
});
