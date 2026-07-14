# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-07-13

### Added

- `a11ymark check`: lints Markdown files, directories (recursive, with
  `node_modules`/hidden dirs skipped) and stdin for WCAG-derived content
  accessibility problems, with a concrete fix hint on every finding.
- Alt-text rules: missing alt (A101), placeholder/filename alt like
  "screenshot" or `IMG_1234` (A102), redundant "image of" prefixes (A103),
  image-only links with no accessible name (A104), over-budget alt length
  with a configurable `--max-alt-length` (A105). Explicit HTML
  `<img alt="">` is honored as the documented decorative opt-out.
- Link rules: a ~35-phrase generic-text blocklist — "click here", "read
  more", … (A110), raw URLs as link text with a `mailto:` exemption
  (A111), empty links (A112), identical text pointing at different
  destinations (A113). The accessible name of an image link is computed
  from its alt text.
- Heading rules: skipped levels (A120), first heading not H1 (A121),
  multiple H1s (A122), empty headings (A123), and standalone bold
  paragraphs posing as headings (A124).
- Table rules: pipe or HTML tables without header cells, with a
  `role="presentation"` exemption (A130), and unnamed header columns
  (A131).
- CommonMark-aware extraction: inline/reference/collapsed images and
  links, autolinks, HTML `<img>`/`<a>`/`<table>`, GFM pipe tables, setext
  headings, code-span masking, escapes, blockquote offset tracking — while
  fenced/indented code, HTML comments, YAML front matter and reference
  definitions are never linted.
- Inline suppressions: `<!-- a11ymark-disable-next-line [codes] -->` and
  `<!-- a11ymark-disable-file [codes] -->`, counted and surfaced in every
  report, never silent.
- `a11ymark rules`: the 16-rule catalog with severity and WCAG criterion,
  as an aligned table or JSON.
- CLI for CI: deterministic output, `--format json` (stable shape),
  `--strict`, `--disable`, `--quiet`, and exit codes distinguishing
  findings (1) from usage/IO errors (2).
- Public programmatic API (`checkMarkdown`, `parseMarkdown`, `runRules`,
  renderers, `RULES`) with type declarations.
- Test suite: 90 node:test tests (unit + CLI integration in fresh temp
  dirs) and an end-to-end `scripts/smoke.sh` against the bundled example
  documents.

[0.1.0]: https://github.com/JaydenCJ/a11ymark/releases/tag/v0.1.0
