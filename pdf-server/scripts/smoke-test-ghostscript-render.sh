#!/usr/bin/env bash
# Smoke test the Ghostscript direct-to-JPEG preview path.
#
#   1. Generate an 8-page A4 PDF.
#   2. Run a single `gs -sDEVICE=jpeg -dJPEGQ=85 -r150` invocation
#      across the whole document.
#   3. Assert every page-NNN.jpg exists, is > 200 bytes, and that the
#      whole render completed in under HARD_LIMIT seconds (default 15s).
#
# Usage:  bash pdf-server/scripts/smoke-test-ghostscript-render.sh [pages] [dpi] [hard_limit_ms]
#         defaults: pages=8, dpi=150, hard_limit_ms=15000
set -euo pipefail

PAGES="${1:-8}"
DPI="${2:-150}"
HARD_LIMIT_MS="${3:-15000}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SRC="$WORK/sample.pdf"
OUT_DIR="$WORK/pages"
mkdir -p "$OUT_DIR"

command -v gs >/dev/null || { echo "FAIL: ghostscript (gs) not on PATH"; exit 2; }

echo "==> Generating ${PAGES}-page A4 PDF via Ghostscript -> $SRC"
PS="$WORK/sample.ps"
{
  echo "<< /PageSize [595 842] >> setpagedevice"
  for i in $(seq 1 "$PAGES"); do
    cat <<EOF
/Helvetica findfont 48 scalefont setfont
72 700 moveto (Smoke test page $i / $PAGES) show
72 600 moveto (A4 portrait, gs JPEG render) show
showpage
EOF
  done
} > "$PS"
gs -dBATCH -dNOPAUSE -dQUIET -sDEVICE=pdfwrite -sOutputFile="$SRC" "$PS"
[[ -s "$SRC" ]] || { echo "FAIL: sample PDF was not produced"; exit 2; }

PATTERN="$OUT_DIR/page-%03d.jpg"
echo "==> Rendering pages 1-$PAGES at ${DPI} dpi -> $PATTERN"
T0=$(date +%s%3N)
gs -q -dSAFER -dBATCH -dNOPAUSE \
   -sDEVICE=jpeg -dJPEGQ=85 \
   -r"$DPI" \
   -dFirstPage=1 -dLastPage="$PAGES" \
   -sOutputFile="$PATTERN" \
   "$SRC"
T1=$(date +%s%3N)
ELAPSED=$((T1 - T0))
echo "    elapsed_ms=$ELAPSED"

MISSING=()
EMPTY=()
for i in $(seq 1 "$PAGES"); do
  f=$(printf "$OUT_DIR/page-%03d.jpg" "$i")
  if [[ ! -f "$f" ]]; then
    MISSING+=("$i")
  elif (( $(stat -c%s "$f" 2>/dev/null || stat -f%z "$f") < 200 )); then
    EMPTY+=("$i")
  fi
done

if (( ${#MISSING[@]} > 0 )) || (( ${#EMPTY[@]} > 0 )); then
  echo "FAIL: gs render did not produce all $PAGES pages"
  echo "  missing=[${MISSING[*]:-}] tiny=[${EMPTY[*]:-}]"
  exit 4
fi

if (( ELAPSED > HARD_LIMIT_MS )); then
  echo "FAIL: gs render took ${ELAPSED}ms (limit ${HARD_LIMIT_MS}ms)"
  exit 5
fi

echo "==> Validating JPEG integrity with Pillow"
python3 - "$OUT_DIR" "$PAGES" <<'PY'
import sys
from pathlib import Path
from PIL import Image

out = Path(sys.argv[1])
pages = int(sys.argv[2])
bad = []
for page in range(1, pages + 1):
    path = out / f"page-{page:03d}.jpg"
    try:
        with Image.open(path) as im:
            im.verify()
    except Exception as exc:
        bad.append((page, f"{type(exc).__name__}: {exc}"))
if bad:
    print(f"FAIL: invalid JPEG(s): {bad}")
    sys.exit(6)

corrupt = out / "corrupt.jpg"
corrupt.write_bytes(b"not a jpeg but bigger than 200 bytes" * 8)
try:
    with Image.open(corrupt) as im:
        im.verify()
except Exception:
    sys.exit(0)
print("FAIL: corrupt JPEG validation unexpectedly passed")
sys.exit(7)
PY

if (( PAGES >= 8 )); then
  SINGLE_DIR="$WORK/single-page"
  mkdir -p "$SINGLE_DIR"
  SINGLE_OUT="$SINGLE_DIR/page-008.jpg"
  echo "==> Rendering single page 8 directly -> $SINGLE_OUT"
  gs -q -dSAFER -dBATCH -dNOPAUSE \
     -sDEVICE=jpeg -dJPEGQ=85 \
     -r"$DPI" \
     -dFirstPage=8 -dLastPage=8 \
     -sOutputFile="$SINGLE_OUT" \
     "$SRC"
  [[ -s "$SINGLE_OUT" ]] || { echo "FAIL: single-page page-008.jpg was not produced"; exit 8; }
  python3 - "$SINGLE_OUT" <<'PY'
import sys
from pathlib import Path
from PIL import Image
path = Path(sys.argv[1])
with Image.open(path) as im:
    im.verify()
PY
fi

echo "==> OK: $PAGES/$PAGES pages rendered in ${ELAPSED}ms (avg $((ELAPSED / PAGES))ms/page)"
ls -la "$OUT_DIR" | sed 's/^/    /'
