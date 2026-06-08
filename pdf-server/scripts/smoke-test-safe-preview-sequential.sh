#!/usr/bin/env bash
# Smoke test the VPS-style safe preview contract without needing DB/S3.
#
# It generates an 8-page A5 PDF, scales it to A4, then renders pages 1..N
# one at a time with Ghostscript and validates every preview + thumbnail.
# This mirrors generate_previews safe mode: deterministic page order,
# per-page validation, no fan-out, no salvage loop.
set -euo pipefail

PAGES="${1:-8}"
DPI="${2:-150}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SRC="$WORK/a5-source.pdf"
A4="$WORK/a4-scaled.pdf"
PREVIEW_DIR="$WORK/preview"
THUMB_DIR="$WORK/thumb"
mkdir -p "$PREVIEW_DIR" "$THUMB_DIR"

command -v gs >/dev/null || { echo "FAIL: ghostscript (gs) not on PATH"; exit 2; }

echo "==> Generating ${PAGES}-page A5 source PDF"
python3 - "$SRC" "$PAGES" <<'PY'
import sys
from reportlab.lib.pagesizes import A5
from reportlab.pdfgen import canvas

out = sys.argv[1]
pages = int(sys.argv[2])
c = canvas.Canvas(out, pagesize=A5)
w, h = A5
for i in range(1, pages + 1):
    c.setFont("Helvetica", 42)
    c.drawString(36, h - 72, f"Page {i} / {pages}")
    c.setFont("Helvetica", 16)
    c.drawString(36, h - 110, "A5 source scaled to A4 smoke test")
    c.showPage()
c.save()
PY

echo "==> Scaling source to A4"
python3 - "$SRC" "$A4" <<'PY'
import sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter, Transformation

src = Path(sys.argv[1])
out = Path(sys.argv[2])
reader = PdfReader(str(src))
writer = PdfWriter()
a4_w, a4_h = 595.2756, 841.8898
for page in reader.pages:
    sw = float(page.mediabox.width)
    sh = float(page.mediabox.height)
    scale = min(a4_w / sw, a4_h / sh)
    tx = (a4_w - sw * scale) / 2
    ty = (a4_h - sh * scale) / 2
    page.add_transformation(Transformation().scale(scale).translate(tx, ty))
    page.mediabox.lower_left = (0, 0)
    page.mediabox.upper_right = (a4_w, a4_h)
    page.cropbox.lower_left = (0, 0)
    page.cropbox.upper_right = (a4_w, a4_h)
    writer.add_page(page)
with out.open('wb') as fh:
    writer.write(fh)
PY

echo "==> Rendering pages sequentially"
for i in $(seq 1 "$PAGES"); do
  printf -v PAGE "%03d" "$i"
  OUT="$PREVIEW_DIR/page-$PAGE.jpg"
  THUMB="$THUMB_DIR/page-$PAGE.png"
  gs -q -dSAFER -dBATCH -dNOPAUSE \
     -sDEVICE=jpeg -dJPEGQ=85 -r"$DPI" \
     -dFirstPage="$i" -dLastPage="$i" \
     -sOutputFile="$OUT" "$A4"
  python3 - "$OUT" "$THUMB" <<'PY'
import sys
from PIL import Image

src, thumb = sys.argv[1], sys.argv[2]
with Image.open(src) as im:
    im.verify()
with Image.open(src) as im:
    im.thumbnail((360, 360))
    im.save(thumb, format='PNG')
with Image.open(thumb) as im:
    im.verify()
PY
done

echo "==> Verifying complete page set"
for i in $(seq 1 "$PAGES"); do
  printf -v PAGE "%03d" "$i"
  [[ -s "$PREVIEW_DIR/page-$PAGE.jpg" ]] || { echo "FAIL: missing preview page $i"; exit 4; }
  [[ -s "$THUMB_DIR/page-$PAGE.png" ]] || { echo "FAIL: missing thumbnail page $i"; exit 5; }
done

echo "==> OK: $PAGES/$PAGES previews and thumbnails produced sequentially"