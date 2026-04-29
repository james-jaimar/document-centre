The profiles are now present, so this is no longer an “ICC file missing” problem. The failing command shows Ghostscript exits 255 while using `pdfwrite` with `-sOutputICCProfile=...`. For `pdfwrite`, the safer/correct pattern is to drive CMYK conversion with `-sDefaultCMYKProfile=<dest>` plus `-sColorConversionStrategy=CMYK`; `-sOutputICCProfile` is primarily for rendering devices and is a known source of `.putdeviceprops` / exit-255 failures on some Ghostscript builds.

Plan:

1. Fix the print-ready Ghostscript command
   - Update `pdf-server/app/services/pdf_ops.py` in `to_print_ready_cmyk()`.
   - Replace the problematic destination-profile usage with:
     - `-sDefaultRGBProfile=/opt/document-centre-api/icc/sRGB_v4_ICC_preference.icc`
     - `-sDefaultCMYKProfile=/opt/document-centre-api/icc/ISOcoated_v2_eci.icc` or selected profile
     - `-sColorConversionStrategy=CMYK`
     - `-dProcessColorModel=/DeviceCMYK`
     - `-dOverrideICC=true`
   - Remove `-sOutputICCProfile=...` from the `pdfwrite` command to avoid the exit-255 device-property failure.
   - Keep the existing intent, black preservation, black point compensation, overprint preservation, and prepress settings unless a specific Ghostscript version rejects one of them.

2. Add fail-useful Ghostscript diagnostics
   - Wrap the `subprocess.run(...)` call so when Ghostscript fails, the job error includes:
     - return code
     - full command
     - stderr tail
     - stdout tail
   - This will make the next failure actionable instead of only showing `CalledProcessError`.

3. Harden the ICC installer against bad downloads
   - Update `install-icc-profiles.sh` so downloaded `.icc` files are validated before being accepted.
   - Basic validation: non-empty, starts with an ICC-like binary header, and is not an HTML page.
   - If a mirror returns an HTML error page with HTTP 200, delete it and try the next mirror.
   - Prefer the direct `raw.githubusercontent.com/.../sRGB-v4.icc` fallback before the GitHub web/raw redirect URL.

4. Add a server-side smoke command to the installer output or docs
   - Add a small Ghostscript sanity check instruction for the VPS, so you can verify the installed profiles and command independently of uploads.
   - The useful immediate check after deploying will be:

```bash
sudo -u root gs -dSAFER -dBATCH -dNOPAUSE \
  -sDEVICE=pdfwrite \
  -dPDFSETTINGS=/prepress \
  -dCompatibilityLevel=1.7 \
  -sColorConversionStrategy=CMYK \
  -dProcessColorModel=/DeviceCMYK \
  -dOverrideICC=true \
  -sDefaultRGBProfile=/opt/document-centre-api/icc/sRGB_v4_ICC_preference.icc \
  -sDefaultCMYKProfile=/opt/document-centre-api/icc/ISOcoated_v2_eci.icc \
  -dRenderIntent=1 \
  -dBlackPtComp=true \
  -dPreserveOverprintSettings=true \
  -dKPreserve=2 \
  -o /tmp/print-ready-smoke.pdf \
  /tmp/YOUR_TEST_INPUT.pdf
```

5. Deployment steps after implementation
   - Rsync the updated `pdf-server/` to `/opt/document-centre-api/`.
   - Re-run the ICC installer to validate profiles.
   - Restart API and workers:

```bash
sudo rsync -av --delete \
  --exclude='.venv' --exclude='.env' --exclude='storage/' \
  --exclude='tmp/' --exclude='__pycache__' --exclude='.git' \
  ~/document-centre/pdf-server/ /opt/document-centre-api/

sudo bash /opt/document-centre-api/scripts/install-icc-profiles.sh
sudo systemctl restart document-centre-api document-centre-worker-heavy document-centre-worker-light
```

Expected result:
- Print-ready conversion should stop failing at ICC setup.
- If Ghostscript still fails on a specific PDF, the job failure will include the real Ghostscript stderr so we can fix the actual PDF/content issue next.