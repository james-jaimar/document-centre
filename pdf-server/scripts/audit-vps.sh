#!/usr/bin/env bash
# audit-vps.sh — capture the live VPS environment so the new Dockerfile can
# reproduce it exactly. Run this ON the production VPS (or pipe via ssh) and
# commit the output as pdf-server/docker/MANIFEST.md.
#
# Usage (local):    sudo bash audit-vps.sh > MANIFEST.md
# Usage (remote):   ssh root@vps 'bash -s' < audit-vps.sh > MANIFEST.md
set -euo pipefail

section() { printf '\n## %s\n\n```\n' "$1"; }
endsec()  { printf '```\n'; }

printf '# Document Centre VPS Manifest\n'
printf '\nGenerated: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
printf 'Host: %s\n' "$(hostname)"
printf 'Kernel: %s\n' "$(uname -a)"

section "OS"
cat /etc/os-release || true
endsec

section "APT packages (relevant)"
dpkg -l 2>/dev/null | awk '/^ii/ {print $2, $3}' | grep -Ei \
  'libreoffice|ghostscript|qpdf|poppler|imagemagick|fonts-|libjpeg|libtiff|libpng|libwebp|libxml2|libxslt|cairo|pango|harfbuzz|fontconfig|freetype|liblcms2|exiftool' \
  | sort || true
endsec

section "Binary versions"
for bin in gs qpdf pdfcpu soffice libreoffice exiftool convert pdftoppm pdfinfo; do
  if command -v "$bin" >/dev/null 2>&1; then
    printf '%-12s %s\n' "$bin:" "$($bin --version 2>&1 | head -n1)"
  else
    printf '%-12s MISSING\n' "$bin:"
  fi
done
endsec

section "Python venv (pip freeze)"
if [ -d /opt/document-centre-api/.venv ]; then
  /opt/document-centre-api/.venv/bin/pip freeze
elif [ -d /opt/printforge/.venv ]; then
  /opt/printforge/.venv/bin/pip freeze
else
  echo "No venv found at known paths — set PATH manually and re-run pip freeze."
fi
endsec

section "System fonts (fc-list)"
fc-list 2>/dev/null | sort || true
endsec

section "ICC profiles installed"
ls -la /usr/share/color/icc/ 2>/dev/null || true
ls -la /opt/document-centre-api/app/services/icc/ 2>/dev/null || true
endsec

section "Systemd unit environment (sanitised)"
for unit in document-centre-api document-centre-worker-heavy document-centre-worker-light \
            document-centre-worker-emails document-centre-listener-emails document-centre-beat; do
  if systemctl cat "$unit" >/dev/null 2>&1; then
    printf '\n--- %s ---\n' "$unit"
    systemctl cat "$unit" | grep -E '^(Environment|EnvironmentFile|ExecStart|WorkingDirectory|User)=' \
      | sed -E 's/(KEY|SECRET|PASSWORD|TOKEN)=[^ ]+/\1=***REDACTED***/g'
  fi
done
endsec

section "Disk usage"
df -h / /tmp /opt 2>/dev/null || true
endsec

printf '\n---\nEnd of manifest.\n'
