# Fix the print-server build: use the colour profiles we already have

## What went wrong

The build now fails loudly if the press colour profiles are missing (that was deliberate). It failed because the install script downloads the profiles from eci.org at build time, and that download came back as a broken file — so the build stopped.

You're right that we already have the profiles. They are committed in the repo under `pdf-server/icc/`: ISO Coated v2, ISO Coated v2 300 and PSO Coated v3, all real files. There is no reason to download anything.

One detail: the three short-name files at the top of that folder are pointers to a path on the old VPS, so they don't resolve anywhere else. The real files sit one level down, and that's what we'll use.

## The fix

1. Copy the profiles straight from the repo into the server image, with the exact names the code expects. No network download during the build.
2. Keep the small sRGB profile download, but only as a last resort: vendor an sRGB profile into the repo alongside the others so the build never depends on an outside site.
3. Keep the build failing loudly if any expected profile is missing after the copy — that check stays.
4. Leave the health screen report of installed profiles as is; it will now always be green.

## Technical notes

- `pdf-server/Dockerfile`: replace the `RUN bash /app/scripts/install-icc-profiles.sh` step with
  `COPY pdf-server/icc/eci_offset_2009/ECI_Offset_2009/ISOcoated_v2_eci.icc`,
  `.../ISOcoated_v2_300_eci.icc`, `pdf-server/icc/pso-coated_v3/PSOcoated_v3.icc`
  and a vendored `sRGB_v4_ICC_preference.icc` into `/opt/document-centre-api/icc/`,
  followed by a short verification `RUN` that checks the `acsp` magic at offset 36 for each
  of the four filenames in `PROFILE_MAP` and exits non-zero on any miss.
- Add `pdf-server/icc/sRGB_v4_ICC_preference.icc` (official ICC v4 preference profile, ~60 KB)
  to the repo; the 480-byte compact variant the build grabbed is valid but not the right
  production default.
- Delete the broken absolute symlinks `pdf-server/icc/{ISOcoated_v2_eci,ISOcoated_v2_300_eci,PSOcoated_v3}.icc`
  and the `__MACOSX` cruft; keep the real files and drop the two source `.zip`s
  (~42 MB folder → a few MB, smaller build context).
- `scripts/install-icc-profiles.sh` stays for VPS/dev use but is no longer part of the image build;
  add a note at the top saying the container copies from `pdf-server/icc/`.
- `app/services/icc_profiles.py` and `health_probes.probe_icc_profiles()` need no change —
  paths and filenames are unchanged.

## Verification

Rebuild the image; the ICC step must pass with all four profiles reported OK, and the
health endpoint must list them as present.
