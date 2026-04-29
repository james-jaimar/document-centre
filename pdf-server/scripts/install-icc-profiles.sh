#!/usr/bin/env bash
# =============================================================================
# Install ICC profiles for print-ready CMYK conversion (idempotent).
#
# Usage:
#     sudo bash scripts/install-icc-profiles.sh
#
# What this installs into /opt/document-centre-api/icc/:
#   - sRGB_v4_ICC_preference.icc          (input working space — required)
#   - ISOcoated_v2_eci.icc       → fogra39
#   - ISOcoated_v2_300_eci.icc   → fogra39_300
#   - PSOcoated_v3.icc           → fogra51
#
# Safe to re-run. Existing files are left alone.
# =============================================================================
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install-icc-profiles.sh"
  exit 1
fi

ICC_DIR="/opt/document-centre-api/icc"
mkdir -p "$ICC_DIR"
cd "$ICC_DIR"

# ---- 1. sRGB v4 (input working space — only ~5 KB, public-domain) -----------
SRGB_FILE="sRGB_v4_ICC_preference.icc"
SRGB_URL="https://www.color.org/profiles/sRGB_v4_ICC_preference.icc"
if [[ ! -s "$SRGB_FILE" ]]; then
  echo "==> Downloading $SRGB_FILE"
  curl -fsSL -o "$SRGB_FILE" "$SRGB_URL"
  chmod 644 "$SRGB_FILE"
else
  echo "==> $SRGB_FILE already present, skipping"
fi

# ---- 2. ECI Offset 2009 bundle (Fogra 39) -----------------------------------
ECI_ZIP="eci_offset_2009.zip"
ECI_URL="http://www.eci.org/_media/downloads/icc_profiles_from_eci/eci_offset_2009.zip"
if [[ ! -d "$ICC_DIR/eci_offset_2009" ]]; then
  if [[ ! -s "$ECI_ZIP" ]]; then
    echo "==> Downloading $ECI_ZIP"
    curl -fsSL -o "$ECI_ZIP" "$ECI_URL" || {
      echo "    WARNING: ECI download failed (network/firewall). Skipping."
    }
  fi
  if [[ -s "$ECI_ZIP" ]]; then
    echo "==> Unpacking $ECI_ZIP"
    unzip -q -o "$ECI_ZIP"
  fi
fi

# Symlink the canonical names
if [[ -f "$ICC_DIR/eci_offset_2009/ECI_Offset_2009/ISOcoated_v2_eci.icc" && ! -e "$ICC_DIR/ISOcoated_v2_eci.icc" ]]; then
  ln -sf "$ICC_DIR/eci_offset_2009/ECI_Offset_2009/ISOcoated_v2_eci.icc" "$ICC_DIR/ISOcoated_v2_eci.icc"
fi
if [[ -f "$ICC_DIR/eci_offset_2009/ECI_Offset_2009/ISOcoated_v2_300_eci.icc" && ! -e "$ICC_DIR/ISOcoated_v2_300_eci.icc" ]]; then
  ln -sf "$ICC_DIR/eci_offset_2009/ECI_Offset_2009/ISOcoated_v2_300_eci.icc" "$ICC_DIR/ISOcoated_v2_300_eci.icc"
fi

# ---- 3. PSO Coated v3 (Fogra 51) --------------------------------------------
PSO_ZIP="pso-coated_v3.zip"
PSO_URL="http://www.eci.org/_media/downloads/icc_profiles_from_eci/pso-coated_v3.zip"
if [[ ! -d "$ICC_DIR/pso-coated_v3" ]]; then
  if [[ ! -s "$PSO_ZIP" ]]; then
    echo "==> Downloading $PSO_ZIP"
    curl -fsSL -o "$PSO_ZIP" "$PSO_URL" || {
      echo "    WARNING: PSO download failed (network/firewall). Skipping."
    }
  fi
  if [[ -s "$PSO_ZIP" ]]; then
    echo "==> Unpacking $PSO_ZIP"
    unzip -q -o "$PSO_ZIP"
  fi
fi
if [[ -f "$ICC_DIR/pso-coated_v3/PSOcoated_v3.icc" && ! -e "$ICC_DIR/PSOcoated_v3.icc" ]]; then
  ln -sf "$ICC_DIR/pso-coated_v3/PSOcoated_v3.icc" "$ICC_DIR/PSOcoated_v3.icc"
fi

# ---- 4. Verify ---------------------------------------------------------------
echo ""
echo "==> Verifying installed profiles"
MISSING=0
for f in sRGB_v4_ICC_preference.icc ISOcoated_v2_eci.icc ISOcoated_v2_300_eci.icc PSOcoated_v3.icc; do
  if [[ -e "$ICC_DIR/$f" ]]; then
    printf "    [ ok ]  %s\n" "$f"
  else
    printf "    [MISS]  %s\n" "$f"
    MISSING=1
  fi
done

if [[ "$MISSING" -ne 0 ]]; then
  echo ""
  echo "One or more profiles are missing. The print-ready task will fail until installed."
  exit 1
fi

echo ""
echo "All ICC profiles installed."
