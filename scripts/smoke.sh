#!/usr/bin/env bash
# Smoke test for a11ymark: exercises the real CLI end to end against the
# bundled example documents and freshly written temp files. No network,
# idempotent, runs from a clean checkout (after `npm install`).
# Prints "SMOKE OK" on success.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

# 1. Build (idempotent).
npm run build >/dev/null 2>&1 || fail "npm run build failed"
CLI="node $ROOT/dist/cli.js"
echo "[smoke] build ok"

# 2. --version matches package.json; --help documents the surface.
PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
CLI_VERSION="$($CLI --version)"
[ "$CLI_VERSION" = "$PKG_VERSION" ] || fail "--version mismatch: $CLI_VERSION != $PKG_VERSION"
HELP="$($CLI --help)"
for word in check rules --strict --disable --format --max-alt-length; do
  echo "$HELP" | grep -q -- "$word" || fail "--help missing $word"
done
echo "[smoke] --help/--version ok ($CLI_VERSION)"

# 3. Error handling: usage and unreadable paths exit 2 (distinct from lint's 1).
set +e
$CLI --frobnicate >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "unknown flag should exit 2"; }
$CLI check "$WORKDIR/nope.md" >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "missing file should exit 2"; }
$CLI check "$WORKDIR/void" --disable A999 >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "unknown rule code should exit 2"; }
set -e
echo "[smoke] error handling ok (exit 2)"

# 4. The clean example passes.
OUT="$($CLI check examples/clean.md)" || fail "clean example should exit 0"
echo "$OUT" | grep -q 'examples/clean.md: OK (0 errors, 0 warnings)' || fail "clean summary wrong: $OUT"
echo "[smoke] clean document ok"

# 5. The flawed example fails with the seeded findings and fix hints.
set +e
FLAWED_OUT="$($CLI check examples/flawed.md)"; FLAWED_CODE=$?
set -e
[ "$FLAWED_CODE" -eq 1 ] || fail "flawed example should exit 1, got $FLAWED_CODE"
echo "$FLAWED_OUT" | grep -q 'FAIL (6 errors, 6 warnings, 1 suppressed)' || fail "flawed counts wrong: $FLAWED_OUT"
for needle in A101 A102 A103 A104 A110 A111 A113 A120 A121 A124 A130 A131; do
  echo "$FLAWED_OUT" | grep -q "$needle" || fail "flawed report missing $needle"
done
echo "$FLAWED_OUT" | grep -q 'fix: make it a real heading: ## Environment variables' || fail "missing bold-as-heading hint"
echo "$FLAWED_OUT" | grep -q 'fix: use ### (level 3)' || fail "missing skipped-level hint"
echo "[smoke] flawed document ok (6 errors, 6 warnings, 1 suppressed, hints present)"

# 6. Directory walk + multi-file summary over a fresh temp tree.
mkdir -p "$WORKDIR/docs/deep" "$WORKDIR/docs/node_modules/pkg"
printf '# Fine\n' > "$WORKDIR/docs/a.md"
printf '![](x.png)\n' > "$WORKDIR/docs/deep/b.md"
printf '![](skipped.png)\n' > "$WORKDIR/docs/node_modules/pkg/skip.md"
set +e
DIR_OUT="$($CLI check "$WORKDIR/docs")"; DIR_CODE=$?
set -e
[ "$DIR_CODE" -eq 1 ] || fail "directory walk should exit 1, got $DIR_CODE"
echo "$DIR_OUT" | grep -q '2 files checked: 1 error, 0 warnings' || fail "directory summary wrong: $DIR_OUT"
echo "$DIR_OUT" | grep -q 'skip.md' && fail "node_modules should be skipped"
echo "[smoke] directory walk ok (node_modules skipped)"

# 7. stdin, --format json, and JSON validity.
set +e
JSON_OUT="$(printf '## starts at two\n' | $CLI check - --format json)"; JSON_CODE=$?
set -e
[ "$JSON_CODE" -eq 0 ] || fail "warning-only stdin should exit 0, got $JSON_CODE"
echo "$JSON_OUT" | grep -q '"code": "A121"' || fail "JSON output missing A121"
echo "$JSON_OUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>JSON.parse(s))" \
  || fail "--format json is not valid JSON"
echo "[smoke] stdin + JSON output ok"

# 8. --strict turns a warnings-only run into a failure; --disable flips it back.
set +e
printf '## starts at two\n' | $CLI check - --strict >/dev/null; STRICT_CODE=$?
printf '## starts at two\n' | $CLI check - --strict --disable A121 >/dev/null; DISABLE_CODE=$?
set -e
[ "$STRICT_CODE" -eq 1 ] || fail "--strict should exit 1 on warnings, got $STRICT_CODE"
[ "$DISABLE_CODE" -eq 0 ] || fail "--strict --disable A121 should exit 0, got $DISABLE_CODE"
echo "[smoke] --strict / --disable ok"

# 9. Inline suppression is honored and surfaced in the summary.
printf -- '<!-- a11ymark-disable-next-line A101 -->\n![](x.png)\n' > "$WORKDIR/sup.md"
SUP_OUT="$($CLI check "$WORKDIR/sup.md")" || fail "suppressed file should exit 0"
echo "$SUP_OUT" | grep -q '1 suppressed' || fail "suppression count not surfaced: $SUP_OUT"
echo "[smoke] inline suppression ok"

# 10. rules catalog: 16 rules in both formats.
RULES_OUT="$($CLI rules)" || fail "rules command failed"
[ "$(echo "$RULES_OUT" | wc -l)" -eq 16 ] || fail "rules table should have 16 rows"
$CLI rules --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).rules;if(r.length!==16)throw new Error('want 16 rules, got '+r.length)})" \
  || fail "rules --format json wrong"
echo "[smoke] rules catalog ok (16 rules)"

# 11. Determinism: two runs over the same input are byte-identical.
$CLI check examples/flawed.md > "$WORKDIR/run1.txt" 2>/dev/null || true
$CLI check examples/flawed.md > "$WORKDIR/run2.txt" 2>/dev/null || true
cmp -s "$WORKDIR/run1.txt" "$WORKDIR/run2.txt" || fail "repeat runs differ"
echo "[smoke] determinism ok"

echo "SMOKE OK"
