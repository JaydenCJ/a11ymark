/**
 * Command-line argument parsing, kept pure (argv in, structured result out)
 * so it can be unit-tested without spawning a process. Unknown flags are
 * hard errors: a typo'd `--disble` silently checking everything would be a
 * worse failure mode than exiting 2.
 */

import { RULES } from "./rules.js";

export interface CliOptions {
  command: "check" | "rules" | "help" | "version";
  paths: string[];
  format: "text" | "json";
  strict: boolean;
  quiet: boolean;
  disable: string[];
  maxAltLength: number | null;
}

export interface CliParseError {
  error: string;
}

export const USAGE = `Usage: a11ymark [check] <file|dir|->... [options]
       a11ymark rules [--format json]

Accessibility linter for Markdown: alt-text quality, link text,
heading structure and table headers. WCAG-derived, offline, zero deps.

Commands:
  check                 lint the given files/directories (default command)
  rules                 print the rule catalog

Options:
  --format text|json    report format (default: text)
  --strict              warnings also fail the run (exit 1)
  --disable CODES       comma-separated rule codes to switch off (repeatable)
  --max-alt-length N    alt-text length budget for A105 (default: 125)
  -q, --quiet           per-file summary lines only
  -h, --help            show this help
  -v, --version         print the version

Paths: directories are searched recursively for .md/.markdown/.mdown files;
"-" reads Markdown from stdin. Exit codes: 0 clean, 1 findings, 2 usage/IO.
`;

const KNOWN_CODES = new Set(RULES.map((r) => r.code));

export function parseCliArgs(argv: string[]): CliOptions | CliParseError {
  const options: CliOptions = {
    command: "check",
    paths: [],
    format: "text",
    strict: false,
    quiet: false,
    disable: [],
    maxAltLength: null,
  };

  let commandSet = false;
  let i = 0;

  const takeValue = (flag: string): string | CliParseError => {
    const value = argv[i + 1];
    if (value === undefined) return { error: `${flag} requires a value` };
    i += 1;
    return value;
  };

  for (; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case "-h":
      case "--help":
        return { ...options, command: "help" };
      case "-v":
      case "--version":
        return { ...options, command: "version" };
      case "-q":
      case "--quiet":
        options.quiet = true;
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--format": {
        const value = takeValue("--format");
        if (typeof value !== "string") return value;
        if (value !== "text" && value !== "json") {
          return { error: `--format must be "text" or "json", got "${value}"` };
        }
        options.format = value;
        break;
      }
      case "--disable": {
        const value = takeValue("--disable");
        if (typeof value !== "string") return value;
        for (const code of value.split(",").map((c) => c.trim().toUpperCase()).filter((c) => c !== "")) {
          if (!KNOWN_CODES.has(code)) return { error: `unknown rule code "${code}" in --disable` };
          options.disable.push(code);
        }
        break;
      }
      case "--max-alt-length": {
        const value = takeValue("--max-alt-length");
        if (typeof value !== "string") return value;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          return { error: `--max-alt-length must be a positive integer, got "${value}"` };
        }
        options.maxAltLength = n;
        break;
      }
      default:
        if (arg === "-") {
          options.paths.push("-");
          break;
        }
        if (arg.startsWith("-")) return { error: `unknown option "${arg}" (see --help)` };
        if (!commandSet && options.paths.length === 0 && (arg === "check" || arg === "rules")) {
          options.command = arg;
          commandSet = true;
          break;
        }
        options.paths.push(arg);
        break;
    }
  }

  if (options.command === "rules" && options.paths.length > 0) {
    return { error: `"rules" takes no paths` };
  }
  if (options.command === "check" && options.paths.length === 0) {
    return { error: "no input files (see --help)" };
  }
  return options;
}
