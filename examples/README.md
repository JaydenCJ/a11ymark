# Examples

Two versions of the same operations guide. `clean.md` is the document as
it should be written: every image described, every link named after its
destination, an unbroken heading outline, fully-headed tables. `flawed.md`
is the same document after the kind of edits nobody flags in review — an
alt text that just says "screenshot", a "click here", a bold line standing
in for a heading, a table column with no name.

The test suite and `scripts/smoke.sh` both run against these files, so
they are guaranteed to stay accurate.

## Try it

```bash
# from the repository root, after `npm install && npm run build`
node dist/cli.js check examples/clean.md    # exit 0, nothing to report
node dist/cli.js check examples/flawed.md   # exit 1, 6 errors + 6 warnings
node dist/cli.js rules                      # the 16-rule catalog
```

## What the seeded problems demonstrate

| Problem in `flawed.md` | Rule | Severity |
|---|---|---|
| Document starts at `##` | A121 | warning |
| `![](img/architecture.png)` — no alt text | A101 | error |
| `![screenshot](…)` — placeholder alt | A102 | error |
| `![Photo of the dashboard](…)` — redundant prefix | A103 | warning |
| `[click here](install.md)` | A110 | error |
| `<https://example.test/api/reference>` — raw URL text | A111 | warning |
| `[![](img/logo.svg)](…)` — image link, no accessible name | A104 | error |
| Two `[release notes]` links to different files | A113 | warning |
| `##` followed by `####` — skipped level | A120 | error |
| `**Environment variables**` standing in for a heading | A124 | warning |
| Pipe table with an unnamed header column | A131 | warning |
| HTML `<table>` without `<th>` | A130 | error |

The last image in `flawed.md` sits under an
`<!-- a11ymark-disable-next-line A101 -->` directive, so the summary line
also shows `1 suppressed` — suppressions are counted, never hidden.
