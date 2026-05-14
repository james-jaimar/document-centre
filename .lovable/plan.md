## Add `pdf-server/scripts/verify-imposition-stack.sh`

A single idempotent, read-only script that prints a pass/fail table for everything the imposition pipeline depends on. Safe to run on the VPS any time (no installs, no mutations).

### What it checks

**1. System binaries** (via `command -v` + `--version`)
- `gs` (ghostscript)
- `qpdf`
- `pdftoppm`, `pdfinfo` (poppler-utils)
- `mutool` (mupdf-tools) — flags as MISSING if absent, with hint `apt-get install -y mupdf-tools`
- `pdfcpu` — flags as MISSING with hint `bash scripts/install-pdfcpu.sh`
- `libreoffice` (soffice)

**2. Python packages** (inside `/opt/document-centre-api/.venv`)
Imports each and prints version:
- pikepdf, pypdf, reportlab, PIL (Pillow), fastapi, celery, redis, supabase, boto3, qrcode
- Specifically flags `qrcode` since it's missing from the VPS `requirements.txt` snapshot the user pasted.

**3. ICC profiles** (under `/opt/document-centre-api/icc`)
- sRGB profile present
- FOGRA39 (or configured CMYK) profile present
- Lists any other `.icc`/`.icm` found

**4. Imposition engine self-test** (pikepdf round-trip)
- Builds a tiny 1-page PDF in `/tmp`, opens with pikepdf, reads MediaBox/TrimBox, writes back. Confirms the in-house engine's core dependency is wired.

**5. Redis ping** (`redis-cli ping` → expect `PONG`)

**6. Systemd units** (status only, no restart)
- `document-centre-api`, `document-centre-worker-heavy`, `document-centre-worker-light`, `document-centre-beat`, `redis-server`

### Output format

```text
== Document Centre — Imposition Stack Verification ==

[BINARIES]
  PASS  ghostscript      10.02.1
  PASS  qpdf             11.6.3
  PASS  pdfcpu           v0.6.0
  FAIL  mutool           not found  (apt-get install -y mupdf-tools)
  ...

[PYTHON PACKAGES]
  PASS  pikepdf          9.4.2
  FAIL  qrcode           not installed  (pip install 'qrcode[pil]==7.4.2')
  ...

[ICC PROFILES]
  PASS  sRGB             /opt/.../sRGB.icc
  PASS  FOGRA39          /opt/.../CoatedFOGRA39.icc

[ENGINE SELF-TEST]
  PASS  pikepdf round-trip + box read

[SERVICES]
  PASS  redis-server     active
  PASS  document-centre-api  active (running)
  ...

== Summary: 14 PASS, 1 FAIL ==
Exit code: 1
```

Exit non-zero if any FAIL so it's CI-friendly.

### Usage

```bash
sudo bash /opt/document-centre-api/scripts/verify-imposition-stack.sh
```

### File created

- `pdf-server/scripts/verify-imposition-stack.sh` (executable, bash, ~120 lines)

No other files touched. No memory changes. No UI changes.
