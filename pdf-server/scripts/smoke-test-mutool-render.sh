#!/usr/bin/env bash
# Smoke-test the MuPDF batch render path end-to-end:
#   1. Generate an 8-page A4 PDF using Ghostscript.
#   2. Probe `mutool draw` for the effective JPEG format token (jpeg vs jpg).
#   3. Run a single `mutool draw` invocation for the whole page range
#      (the same code path used by rasterize_pages_mutool).
#   4. Assert every page-%03d.<ext> file exists and is non-empty.
#
# Exits non-zero (and prints what is missing) if MuPDF silently drops pages —
# which is the failure mode this script is here to catch.
#
# Usage:  bash pdf-server/scripts/smoke-test-mutool-render.sh [pages] [dpi]
#         defaults: pages=8, dpi=150
set -euo pipefail

PAGES="${1:-8}"
DPI="${2:-150}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SRC="$WORK/sample.pdf"
OUT_DIR="$WORK/pages"
mkdir -p "$OUT_DIR"

command -v gs >/dev/null     || { echo "FAIL: ghostscript (gs) not on PATH"; exit 2; }
command -v mutool >/dev/null || { echo "FAIL: mutool not on PATH"; exit 2; }

echo "==> Generating ${PAGES}-page A4 PDF via Ghostscript -> $SRC"
PS="$WORK/sample.ps"
{
  echo "<< /PageSize [595 842] >> setpagedevice"
  for i in $(seq 1 "$PAGES"); do
    cat <<EOF
/Helvetica findfont 48 scalefont setfont
72 700 moveto (Smoke test page $i / $PAGES) show
72 600 moveto (A4 portrait · 595x842pt) show
showpage
EOF
  done
} > "$PS"
gs -dBATCH -dNOPAUSE -dQUIET -sDEVICE=pdfwrite -sOutputFile="$SRC" "$PS"
[[ -s "$SRC" ]] || { echo "FAIL: sample PDF was not produced"; exit 2; }

echo "==> Probing mutool effective JPEG format token"
EXT="jpg"; FMT="jpeg"
PROBE_DIR="$WORK/probe"; mkdir -p "$PROBE_DIR"
if mutool draw -F jpeg -o "$PROBE_DIR/p-%03d.jpeg" -r 72 "$SRC" 1 >/dev/null 2>&1 \
     && [[ -s "$PROBE_DIR/p-001.jpeg" ]]; then
  FMT="jpeg"; EXT="jpeg"
elif mutool draw -F jpg  -o "$PROBE_DIR/p-%03d.jpg"  -r 72 "$SRC" 1 >/dev/null 2>&1 \
       && [[ -s "$PROBE_DIR/p-001.jpg" ]]; then
  FMT="jpg"; EXT="jpg"
else
  echo "FAIL: mutool does not accept -F jpeg OR -F jpg on this build"
  mutool draw -F jpeg -o "$PROBE_DIR/p-%03d.jpeg" -r 72 "$SRC" 1 2>&1 | tail -n 20 | sed 's/^/  /'
  exit 3
fi
echo "    format=$FMT  ext=$EXT"

PATTERN="$OUT_DIR/page-%03d.$EXT"
echo "==> Batch rendering pages 1-$PAGES at ${DPI} dpi -> $PATTERN"
T0=$(date +%s%3N)
set +e
mutool draw -F "$FMT" -o "$PATTERN" -r "$DPI" "$SRC" "1-$PAGES" \
  >"$WORK/mutool.stdout" 2>"$WORK/mutool.stderr"
RC=$?
set -e
T1=$(date +%s%3N)
ELAPSED=$((T1 - T0))
echo "    rc=$RC  elapsed_ms=$ELAPSED"

MISSING=()
EMPTY=()
for i in $(seq 1 "$PAGES"); do
  f=$(printf "$OUT_DIR/page-%03d.$EXT" "$i")
  if [[ ! -f "$f" ]]; then
    MISSING+=("$i")
  elif [[ ! -s "$f" ]]; then
    EMPTY+=("$i")
  fi
done

if (( ${#MISSING[@]} > 0 )) || (( ${#EMPTY[@]} > 0 )) || (( RC != 0 )); then
  echo "FAIL: mutool batch render did not produce all $PAGES pages"
  echo "  rc=$RC missing=[${MISSING[*]:-}] empty=[${EMPTY[*]:-}]"
  echo "  stderr_tail:"; tail -n 20 "$WORK/mutool.stderr" | sed 's/^/    /'
  exit 4
fi

echo "==> OK: $PAGES/$PAGES pages rendered in ${ELAPSED}ms (avg $((ELAPSED / PAGES))ms/page)"
ls -la "$OUT_DIR" | sed 's/^/    /'
