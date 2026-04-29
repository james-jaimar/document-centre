#!/usr/bin/env bash
# Run the same Ghostscript fallback ladder used by the print-ready task,
# directly on the VPS, against an arbitrary input PDF.
#
# Usage:  sudo bash scripts/smoke-test-print-ready.sh <input.pdf>
#
# Outputs go to /tmp/print-ready-smoke-<attempt>.pdf so you can compare
# which command actually succeeded.
set -euo pipefail

if [[ "$#" -lt 1 ]]; then
  echo "Usage: $0 <input.pdf>"
  exit 64
fi

IN="$1"
[[ -s "$IN" ]] || { echo "Input not found or empty: $IN"; exit 1; }

ICC_DIR="/opt/document-centre-api/icc"
RGB="$ICC_DIR/sRGB_v4_ICC_preference.icc"
CMYK="$ICC_DIR/ISOcoated_v2_eci.icc"
SRC_DIR="$(dirname "$(readlink -f "$IN")")"
OUT_DIR="/tmp"

run_attempt() {
  local name="$1"; shift
  local out="$OUT_DIR/print-ready-smoke-$name.pdf"
  rm -f "$out"
  echo "==> Attempt: $name"
  echo "    cmd: gs $*"
  set +e
  gs "$@" -o "$out" "$IN" 1>"/tmp/gs-$name.stdout" 2>"/tmp/gs-$name.stderr"
  local rc=$?
  set -e
  local size=0
  [[ -f "$out" ]] && size=$(stat -c%s "$out")
  echo "    rc=$rc out_size=$size"
  echo "    stderr_tail:"; tail -n 5 "/tmp/gs-$name.stderr" | sed 's/^/      /'
  echo "    stdout_tail:"; tail -n 5 "/tmp/gs-$name.stdout" | sed 's/^/      /'
  if [[ $rc -eq 0 && $size -gt 0 ]]; then
    echo "    SUCCESS — output: $out"
    return 0
  fi
  return 1
}

# Attempt 1: rich ICC
if run_attempt rich_icc \
  -dSAFER --permit-file-read="$ICC_DIR" --permit-file-read="$SRC_DIR" --permit-file-write="$OUT_DIR" \
  -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dCompatibilityLevel=1.7 \
  -sColorConversionStrategy=CMYK -dProcessColorModel=/DeviceCMYK \
  -dOverrideICC=true -sDefaultRGBProfile="$RGB" -sDefaultCMYKProfile="$CMYK" \
  -dRenderIntent=1 -dBlackPtComp=true -dPreserveOverprintSettings=true -dKPreserve=2; then
  exit 0
fi

# Attempt 2: core ICC
if run_attempt core_icc \
  -dSAFER --permit-file-read="$ICC_DIR" --permit-file-read="$SRC_DIR" --permit-file-write="$OUT_DIR" \
  -dBATCH -dNOPAUSE -sDEVICE=pdfwrite \
  -sColorConversionStrategy=CMYK -dProcessColorModel=/DeviceCMYK \
  -dOverrideICC=true -sDefaultRGBProfile="$RGB" -sDefaultCMYKProfile="$CMYK"; then
  exit 0
fi

# Attempt 3: builtin CMYK
if run_attempt builtin_cmyk \
  -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite \
  -sColorConversionStrategy=CMYK -dProcessColorModel=/DeviceCMYK; then
  exit 0
fi

# Attempt 4: passthrough
run_attempt passthrough -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite || {
  echo "ALL attempts failed."
  exit 1
}
