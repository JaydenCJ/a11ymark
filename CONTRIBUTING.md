# Contributing to a11ymark

Issues, discussions and pull requests are all welcome — this project aims
to stay small, zero-dependency at runtime, and honest about what it checks.

## Getting started

Requirements: Node.js >= 22.13 (for the stable `node:test` runner used by the suite).

```bash
git clone https://github.com/JaydenCJ/a11ymark.git
cd a11ymark
npm install            # installs typescript, the only devDependency
npm run build          # compile TypeScript to dist/
npm test               # build + 90 node:test tests
bash scripts/smoke.sh  # end-to-end CLI check against examples/
```

`scripts/smoke.sh` exercises the real CLI (check, rules, exit codes,
--strict, --disable, stdin, JSON output, directory walking, suppression,
determinism) against the bundled example documents and must print `SMOKE OK`.

## Before you open a pull request

1. `npx tsc -p tsconfig.json --noEmit` — the tree must type-check clean (strict mode is enforced).
2. `npm test` — all tests must pass.
3. `bash scripts/smoke.sh` — must print `SMOKE OK`.
4. Add tests for behavior changes; keep logic in pure, unit-testable
   modules (parsing, rules and rendering all take values, not file
   handles — only the CLI touches the filesystem).
5. New rules need a row in `docs/rules.md`, a WCAG citation, a stable code
   that is never reused, and at least one test per fire/no-fire case.

## Ground rules

- **No runtime dependencies.** The zero-dependency install is a core
  feature; adding one needs justification in the PR and will usually be
  declined.
- No network calls, ever — the tool reads local files and prints. That is
  the whole I/O surface.
- Rule codes (`A1xx`) are stable API: never renumber or repurpose an
  existing code; add new ones instead.
- Every diagnostic that can carry a safe, concrete fix hint must carry
  one; when a fix cannot be derived confidently, say nothing rather than
  something wrong.
- Suppressions are counted and reported, never silent.
- Code comments and doc comments are written in English.

## Reporting bugs

Please include: `a11ymark --version` output, the exact command line, and
the smallest Markdown snippet that reproduces the problem — a single image
or link line is usually enough. If a rule is wrong about WCAG, cite the
success criterion and the interpretation you expected; those reports are
gold.

## Security

Do not open public issues for security problems; use GitHub private
vulnerability reporting on this repository instead.
