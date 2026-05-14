#!/usr/bin/env bash
# Install pdfcpu (Go-based PDF processor) into /usr/local/bin.
#
# Used as a fast fallback / utility belt for n-up, booklet, grid, validation
# alongside the in-house pikepdf imposer in app/services/pdf_ops.py.
#
# Idempotent: skips download if /usr/local/bin/pdfcpu already exists.
set -euo pipefail

PDFCPU_VERSION="${PDFCPU_VERSION:-0.6.0}"
TARGET="/usr/local/bin/pdfcpu"

if [[ -x "${TARGET}" ]]; then
  echo "pdfcpu already installed at ${TARGET} ($(${TARGET} version 2>/dev/null | head -1 || true)) — skipping."
  exit 0
fi

ARCHIVE="/tmp/pdfcpu_${PDFCPU_VERSION}.tar.xz"
URL="https://github.com/pdfcpu/pdfcpu/releases/download/v${PDFCPU_VERSION}/pdfcpu_${PDFCPU_VERSION}_Linux_x86_64.tar.xz"

echo ">> Downloading pdfcpu ${PDFCPU_VERSION}…"
curl -fsSL "${URL}" -o "${ARCHIVE}"

echo ">> Extracting…"
tar -xJf "${ARCHIVE}" -C /tmp

SRC="/tmp/pdfcpu_${PDFCPU_VERSION}_Linux_x86_64/pdfcpu"
if [[ ! -f "${SRC}" ]]; then
  echo "ERROR: expected ${SRC} not found in archive" >&2
  exit 1
fi

mv "${SRC}" "${TARGET}"
chmod +x "${TARGET}"
rm -rf "${ARCHIVE}" "/tmp/pdfcpu_${PDFCPU_VERSION}_Linux_x86_64"

echo ">> pdfcpu installed: $(${TARGET} version | head -1)"
