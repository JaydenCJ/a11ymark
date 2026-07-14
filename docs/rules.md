# Rule reference

Sixteen rules in four groups: images (A10x), links (A11x), headings
(A12x) and tables (A13x). Errors are findings a screen-reader user hits as
a wall; warnings are findings they hit as friction. Codes are stable API —
they are never renumbered or repurposed, only added.

Every rule cites the [WCAG 2.2](https://www.w3.org/TR/WCAG22/) success
criterion it is derived from. a11ymark checks Markdown *content*, so the
criteria are applied to what the rendered page would expose to assistive
technology, not to the raw markup.

## Suppressing a finding

False positives happen. Two escape hatches, both precise and both counted
in the report (a suppression is visible in the summary, never silent):

```markdown
<!-- a11ymark-disable-next-line A103 -->
![Screenshot of the exact pixels that matter here](pixel-test.png)

<!-- a11ymark-disable-file A113 -->
```

Codes are optional — a bare directive suppresses every rule for its scope.
`--disable CODES` switches rules off for a whole run.

## Images (A10x) — WCAG 1.1.1 Non-text Content

### A101 missing-alt-text (error)

Fires on `![](x.png)` and on HTML `<img>` without an `alt` attribute.
A screen reader either announces the filename or nothing. Markdown has no
decorative marker, so an intentionally decorative image should be written
as HTML: `<img src="border.png" alt="">` — the explicit empty `alt` is the
documented opt-out and a11ymark accepts it silently.

### A102 placeholder-alt-text (error)

Alt text that is technically present but informationally empty: bare
placeholder words ("image", "screenshot", "logo", "tbd", …), camera-roll
names (`IMG_1234`, `Screenshot 2026-07-04`), anything ending in an image
extension, or text equal to the file's basename. These usually come from
editors that auto-fill alt with the filename — worse than nothing, because
they *look* covered in an audit.

### A103 redundant-alt-prefix (warning)

"Image of", "Photo of", "Screenshot showing" — screen readers already
announce the element as an image, so the prefix is pure noise repeated on
every image. The hint shows the alt with the prefix removed. Only leading
prefixes fire; "Map of the campus" is fine.

### A104 image-link-no-text (error)

A link whose only content is an image with empty alt has no accessible
name at all — it is announced as "link" and nothing else. Reported on the
link (once, not doubled with A101) because the fix is naming the
*destination*, not describing the picture.

### A105 alt-text-too-long (warning)

Alt text is read linearly and cannot be skimmed or re-queried; the
conventional budget is ~125 characters. Long descriptions belong in the
surrounding prose or a caption. Tune with `--max-alt-length N`.

## Links (A11x) — WCAG 2.4.4 Link Purpose (In Context)

### A110 generic-link-text (error)

"Click here", "read more", "this link", "details", … — a curated blocklist
of ~35 phrases, matched case-insensitively after trimming punctuation and
arrows. Screen-reader users navigate by tabbing through a list of links
with all surrounding context stripped; a page of "click here" is a page of
identical unlabeled buttons. Note the accessible name of an image link is
its alt text, so `[![Click here](btn.png)](x)` fires too.

### A111 url-as-link-text (warning)

Autolinks (`<https://…>`) and link texts that are themselves URLs are read
out character by character. `mailto:` autolinks are exempt — an email
address is its own best name. Warning, not error: for genuinely citational
URLs (a references section) this can be intentional.

### A112 empty-link-text (error)

`[](x.md)` or `<a href="…"></a>` — announced as just "link".

### A113 ambiguous-link-text (warning)

The same text pointing at different destinations within one document
("release notes" → v1, "release notes" → v2). In a links list the two are
indistinguishable. Fires on the later occurrence and cites the line of the
first. Generic texts are excluded (A110 already errors on each).

## Headings (A12x) — WCAG 1.3.1 Info and Relationships, 2.4.6 Headings and Labels

### A120 skipped-heading-level (error)

`##` followed by `####`. Heading-jump navigation ("next level-3 heading")
silently finds nothing, and users legitimately wonder whether content was
missed. Ascending any number of levels is legal; only descents can skip.

### A121 first-heading-not-h1 (warning)

The first heading sets the document's root; starting at `##` usually means
the title was written as bold text or omitted. Warning because embedded
contexts (a docs site that injects the H1) are common — disable it there.

### A122 multiple-h1 (warning)

Two `#` headings compete for "document title". Screen readers offer
jump-to-top-heading; two tops is a coin flip.

### A123 empty-heading (error)

`##` with no text (including text that is only emphasis markers) is a
navigation stop that announces nothing.

### A124 bold-as-heading (warning)

A standalone single-line bold paragraph — short, no terminal punctuation,
blank lines around it — is a heading to sighted eyes and a plain paragraph
to everyone else: invisible to outline navigation. Bold lead-ins
(`**Note:** …`) and full sentences do not fire.

## Tables (A13x) — WCAG 1.3.1 Info and Relationships

### A130 table-missing-header (error)

A pipe table whose header row is entirely empty, or an HTML `<table>`
without a single `<th>`. Without headers a screen reader announces bare
cell values with no column context. `role="presentation"` marks an HTML
layout table as exempt.

### A131 empty-header-cell (warning)

A header row where *some* columns are unnamed. Cells in that column are
announced with no label. The diagnostic column points at the empty cell.

## Scope and known limits (0.1.0)

- Inline constructs are line-scoped: a link or `<img>` tag wrapped across
  lines is not seen. Multi-line constructs are rare in practice and on the
  roadmap.
- Fenced/indented code, HTML comments, YAML front matter and reference
  definition lines are never linted; blockquoted content is.
- HTML parsing is tag-level, not a DOM: enough for the `<img>`, `<a>` and
  `<table>` checks above, by design nothing more.
