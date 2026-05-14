#!/usr/bin/env bash
# Read-only verification of the imposition pipeline stack.
# Safe to run any time — performs no installs and no mutations.
#
# Usage: sudo bash /opt/document-centre-api/scripts/verify-imposition-stack.sh
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/document-centre-api}"
VENV_PY="${APP_DIR}/.venv/bin/python"
ICC_DIR="${ICC_DIR:-${APP_DIR}/icc}"

PASS=0
FAIL=0

# Colour only when stdout is a TTY.
if [[ -t 1 ]]; then
  C_PASS="\033[32m"; C_FAIL="\033[31m"; C_HEAD="\033[1;36m"; C_OFF="\033[0m"
else
  C_PASS=""; C_FAIL=""; C_HEAD=""; C_OFF=""
fi

row_pass() { printf "  ${C_PASS}PASS${C_OFF}  %-22s %s\n" "$1" "${2:-}"; PASS=$((PASS+1)); }
row_fail() { printf "  ${C_FAIL}FAIL${C_OFF}  %-22s %s\n" "$1" "${2:-}"; FAIL=$((FAIL+1)); }
section() { printf "\n${C_HEAD}[%s]${C_OFF}\n" "$1"; }

printf "${C_HEAD}== Document Centre — Imposition Stack Verification ==${C_OFF}\n"
printf "App dir : %s\n" "$APP_DIR"
printf "Venv    : %s\n" "$VENV_PY"
printf "ICC dir : %s\n" "$ICC_DIR"

# ---------------------------------------------------------------------------
section "BINARIES"

check_bin() {
  local name="$1" cmd="$2" ver_cmd="$3" hint="${4:-}"
  if command -v "$cmd" >/dev/null 2>&1; then
    local v
    v="$(eval "$ver_cmd" 2>&1 | head -1 | tr -d '\r')"
    row_pass "$name" "$v"
  else
    row_fail "$name" "not found  ($hint)"
  fi
}

check_bin "ghostscript" "gs"          "gs --version"                   "apt-get install -y ghostscript"
check_bin "qpdf"        "qpdf"        "qpdf --version"                 "apt-get install -y qpdf"
check_bin "pdftoppm"    "pdftoppm"    "pdftoppm -v 2>&1"               "apt-get install -y poppler-utils"
check_bin "pdfinfo"     "pdfinfo"     "pdfinfo -v 2>&1"                "apt-get install -y poppler-utils"
check_bin "mutool"      "mutool"      "mutool -v 2>&1"                 "apt-get install -y mupdf-tools"
check_bin "pdfcpu"      "pdfcpu"      "pdfcpu version"                 "bash ${APP_DIR}/scripts/install-pdfcpu.sh"
check_bin "libreoffice" "libreoffice" "libreoffice --version"          "apt-get install -y libreoffice"

# ---------------------------------------------------------------------------
section "PYTHON PACKAGES"

if [[ ! -x "$VENV_PY" ]]; then
  row_fail "venv python" "not found at $VENV_PY  (bash ${APP_DIR}/scripts/bootstrap-app.sh)"
else
  check_pkg() {
    local pkg="$1" import_name="$2" hint="${3:-}"
    local out
    out="$("$VENV_PY" -c "import importlib,sys
m = importlib.import_module('$import_name')
v = getattr(m, '__version__', None) or getattr(m, 'VERSION', None) or '?'
print(v)" 2>&1)"
    if [[ $? -eq 0 ]]; then
      row_pass "$pkg" "$out"
    else
      row_fail "$pkg" "not installed  ($hint)"
    fi
  }

  check_pkg "pikepdf"   "pikepdf"   "pip install pikepdf==9.4.2"
  check_pkg "pypdf"     "pypdf"     "pip install pypdf==5.0.1"
  check_pkg "reportlab" "reportlab" "pip install reportlab==4.2.5"
  check_pkg "Pillow"    "PIL"       "pip install pillow==11.0.0"
  check_pkg "fastapi"   "fastapi"   "pip install fastapi==0.115.0"
  check_pkg "celery"    "celery"    "pip install 'celery[redis]==5.4.0'"
  check_pkg "redis"     "redis"     "pip install redis==5.2.0"
  check_pkg "supabase"  "supabase"  "pip install supabase==2.9.1"
  check_pkg "boto3"     "boto3"     "pip install boto3==1.35.36"
  check_pkg "qrcode"    "qrcode"    "pip install 'qrcode[pil]==7.4.2'"
fi

# ---------------------------------------------------------------------------
section "ICC PROFILES"

if [[ ! -d "$ICC_DIR" ]]; then
  row_fail "icc dir" "missing $ICC_DIR  (bash ${APP_DIR}/scripts/install-icc-profiles.sh)"
else
  srgb="$(find "$ICC_DIR" -type f \( -iname '*srgb*.icc' -o -iname '*srgb*.icm' \) 2>/dev/null | head -1)"
  if [[ -n "$srgb" ]]; then row_pass "sRGB" "$srgb"; else row_fail "sRGB" "no sRGB profile found"; fi

  cmyk="$(find "$ICC_DIR" -type f \( -iname '*fogra*.icc' -o -iname '*fogra*.icm' -o -iname '*cmyk*.icc' \) 2>/dev/null | head -1)"
  if [[ -n "$cmyk" ]]; then row_pass "CMYK (FOGRA)" "$cmyk"; else row_fail "CMYK (FOGRA)" "no CMYK/FOGRA profile found"; fi

  total="$(find "$ICC_DIR" -type f \( -iname '*.icc' -o -iname '*.icm' \) 2>/dev/null | wc -l | tr -d ' ')"
  printf "        (total ICC files: %s)\n" "$total"
fi

# ---------------------------------------------------------------------------
section "ENGINE SELF-TEST"

if [[ -x "$VENV_PY" ]]; then
  out="$("$VENV_PY" - <<'PY' 2>&1
import sys, tempfile, os
try:
    import pikepdf
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    c = canvas.Canvas(tmp.name, pagesize=A4)
    c.drawString(100, 750, "verify-imposition-stack")
    c.showPage(); c.save()
    with pikepdf.open(tmp.name, allow_overwriting_input=True) as pdf:
        page = pdf.pages[0]
        mb = page.mediabox
        # Stamp a TrimBox to confirm box-write path works.
        page.trimbox = [float(mb[0]) + 8.5, float(mb[1]) + 8.5,
                        float(mb[2]) - 8.5, float(mb[3]) - 8.5]
        pdf.save(tmp.name)
    with pikepdf.open(tmp.name) as pdf:
        tb = pdf.pages[0].trimbox
        assert tb is not None
    os.unlink(tmp.name)
    print(f"pikepdf {pikepdf.__version__} round-trip + TrimBox write/read OK")
except Exception as e:
    print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(1)
PY
)"
  if [[ $? -eq 0 ]]; then
    row_pass "pikepdf round-trip" "$out"
  else
    row_fail "pikepdf round-trip" "$out"
  fi
else
  row_fail "pikepdf round-trip" "venv missing — skipped"
fi

# ---------------------------------------------------------------------------
section "REDIS"

if command -v redis-cli >/dev/null 2>&1; then
  reply="$(redis-cli ping 2>&1 | tr -d '\r')"
  if [[ "$reply" == "PONG" ]]; then
    row_pass "redis-cli ping" "PONG"
  else
    row_fail "redis-cli ping" "got: $reply"
  fi
else
  row_fail "redis-cli" "not found  (apt-get install -y redis-tools)"
fi

# ---------------------------------------------------------------------------
section "SYSTEMD UNITS"

check_unit() {
  local unit="$1"
  if ! command -v systemctl >/dev/null 2>&1; then
    row_fail "$unit" "systemctl not available"; return
  fi
  if ! systemctl list-unit-files "$unit" >/dev/null 2>&1 \
       || ! systemctl list-unit-files | grep -q "^${unit}"; then
    row_fail "$unit" "unit file not installed"
    return
  fi
  local state sub
  state="$(systemctl is-active "$unit" 2>/dev/null || true)"
  sub="$(systemctl show -p SubState --value "$unit" 2>/dev/null || true)"
  if [[ "$state" == "active" ]]; then
    row_pass "$unit" "active ($sub)"
  else
    row_fail "$unit" "$state ($sub)"
  fi
}

check_unit "redis-server.service"
check_unit "document-centre-api.service"
check_unit "document-centre-worker-heavy.service"
check_unit "document-centre-worker-light.service"
check_unit "document-centre-beat.service"

# ---------------------------------------------------------------------------
TOTAL=$((PASS+FAIL))
printf "\n${C_HEAD}== Summary: %d/%d PASS, %d FAIL ==${C_OFF}\n" "$PASS" "$TOTAL" "$FAIL"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
