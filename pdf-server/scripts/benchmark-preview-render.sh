#!/usr/bin/env bash
# Compare raw Ghostscript rendering with the app's preview preparation path.
# Usage: bash pdf-server/scripts/benchmark-preview-render.sh /path/to/input.pdf [dpi]
set -euo pipefail

SRC="${1:?usage: benchmark-preview-render.sh input.pdf [dpi]}"
DPI="${2:-150}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v gs >/dev/null || { echo "FAIL: ghostscript (gs) not on PATH"; exit 2; }
test -s "$SRC" || { echo "FAIL: input PDF not found: $SRC"; exit 2; }

run_gs() {
  local label="$1" input="$2" out_dir="$3"
  mkdir -p "$out_dir"
  local pattern="$out_dir/page-%03d.jpg"
  echo "==> $label"
  local t0 t1 elapsed count
  t0=$(date +%s%3N)
  set +e
  gs -q -dSAFER -dBATCH -dNOPAUSE \
     -sDEVICE=jpeg -dJPEGQ=85 -r"$DPI" \
     -sOutputFile="$pattern" "$input" \
     >"$out_dir/stdout.log" 2>"$out_dir/stderr.log"
  local rc=$?
  set -e
  t1=$(date +%s%3N)
  elapsed=$((t1 - t0))
  count=$(find "$out_dir" -maxdepth 1 -name 'page-*.jpg' | wc -l | tr -d ' ')
  echo "    rc=$rc elapsed_ms=$elapsed pages=$count bytes=$(stat -c%s "$input" 2>/dev/null || stat -f%z "$input")"
  if [[ -s "$out_dir/stderr.log" ]]; then
    echo "    stderr_tail:"
    tail -n 8 "$out_dir/stderr.log" | sed 's/^/      /'
  fi
}

run_gs "raw original PDF" "$SRC" "$WORK/raw"

echo "==> app render-box preparation check"
PYTHONPATH="${PYTHONPATH:-/app}" python3 - <<PY
from pathlib import Path
from app.services.pdf_ops import pdf_ops
src = Path("$SRC")
out = Path("$WORK/cropped.pdf")
box = pdf_ops.derive_default_render_box(src)
print(f"    detected_box={box}")
if box:
    pdf_ops.crop_to_box(src, out, box)
    print(f"    cropped_pdf={out} bytes={out.stat().st_size}")
else:
    print("    cropped_pdf=not_created")
PY

if [[ -s "$WORK/cropped.pdf" ]]; then
  run_gs "after pikepdf box rewrite" "$WORK/cropped.pdf" "$WORK/cropped"
fi

echo "==> output samples"
find "$WORK" -maxdepth 2 -type f \( -name 'page-*.jpg' -o -name '*.log' \) -printf '    %p %s bytes\n' | sort | head -n 40
