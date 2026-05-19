
# Industry-grade black & colour conversion

## The problem we just observed

INV-00057-3 (a B&W job) came out at **98% K** in Acrobat Output Preview instead of **100% K** with 0% CMY. That's because our current `pdf_ops.grayscale()` is the absolute minimum Ghostscript invocation:

```
-sColorConversionStrategy=Gray
-dProcessColorModel=/DeviceGray
```

No source profiles, no black-point compensation, no K-preservation, no object-type handling, no `-dBlackText`. Ghostscript falls back to a colorimetric luminance conversion of a CMYK rich black (e.g. 60/40/40/100 from the customer's Word/PDF export), which lands at ~98% gray instead of solid 100%. Same class of issue exists in our CMYK path: text that should print 0/0/0/100 can end up as four-colour rich black.

Industry-standard print workflows (Adobe PDF Print Engine, Heidelberg Prinect, callas pdfToolbox, Enfocus PitStop) all do three things we currently don't:

1. **Object-aware ICC** — text & vector get *RelativeColorimetric + Black Point Compensation + K-only preservation*; images get *Perceptual*.
2. **Explicit black handling** — `-dBlackText=true -dBlackVector=true -dKPreserve=2` (Ghostscript ≥ 9.55 / ≥ 10.x — pdfwrite K-only enforcement for text and line art).
3. **Overprint + transparency preservation** — `-dPreserveOverprintSettings=true`, `-dOverprint=/simulate` so simulated press behaviour matches what the operator sees in Acrobat.

## What this plan changes

All changes are in `pdf-server/app/services/pdf_ops.py` plus one small admin-surfaced setting. No DB migrations, no frontend changes.

### 1. Rewrite `grayscale()` to "pure-K-text" grade

Target Ghostscript invocation:

```text
gs -dSAFER -dBATCH -dNOPAUSE -dAutoRotatePages=/None
   -sDEVICE=pdfwrite
   -dCompatibilityLevel=1.7
   -sColorConversionStrategy=Gray
   -dProcessColorModel=/DeviceGray
   -dOverrideICC=true
   -sDefaultGrayProfile=<Dot Gain 15% .icc>
   -sDefaultRGBProfile=<sRGB v4.icc>
   -sDefaultCMYKProfile=<ISOcoated_v2_eci.icc>
   -dRenderIntent=1                # RelativeColorimetric
   -dBlackPtComp=true
   -dKPreserve=2                   # keep CMYK K-only as gray K-only
   -dBlackText=true                # FORCE pure K for text  ← key fix
   -dBlackVector=true              # FORCE pure K for line art
   -dPreserveOverprintSettings=true
   -dHaveTransparency=true
   -dDownsampleColorImages=false
   -dDownsampleGrayImages=false
   -dAutoFilterGrayImages=false -dGrayImageFilter=/FlateEncode
   -o out.pdf in.pdf
```

Also bundle a **Dot Gain 15%** ICC (or `sGray_v4.icc`) in `pdf-server/app/services/icc_profiles.py` under slug `"gray_dotgain15"` so the path resolves cleanly. Fallback to GS built-in `Gray` if missing, identical to the existing `to_print_ready_cmyk` attempt chain (`rich → core → builtin → passthrough`).

### 2. Add `-dBlackText / -dBlackVector / -dKPreserve` to `to_print_ready_cmyk()`

Already partially done (lines 1865-1869). Extend the `rich_icc` attempt to always set:
- `-dBlackText=true`
- `-dBlackVector=true`
- `-dKPreserve=2` (currently only when `preserve_black` is true — promote to default; nobody wants 60/40/40/100 text)
- `-dOverprint=/simulate`

Also add a **source-object ICC config** (`-sSourceObjectICC=/opt/document-centre-api/icc/object_default.txt`) that maps:

```
Text   RGB   <sRGB.icc>  RelativeColorimetric  BlackPtComp=1  KPreserve=1
Vector RGB   <sRGB.icc>  RelativeColorimetric  BlackPtComp=1  KPreserve=1
Image  RGB   <sRGB.icc>  Perceptual            BlackPtComp=1  KPreserve=0
Text   CMYK  <Fogra.icc> RelativeColorimetric  BlackPtComp=1  KPreserve=2
Vector CMYK  <Fogra.icc> RelativeColorimetric  BlackPtComp=1  KPreserve=2
Image  CMYK  <Fogra.icc> Perceptual            BlackPtComp=1  KPreserve=1
```

This is the canonical Ghostscript print-shop config (documented in `gs/doc/UseICC.htm`). Bundle it via the same `install-icc-profiles.sh` script.

### 3. Admin-surfaced override (small, optional)

Already in `FamilyPrintConfig` (`color_output`, `cmyk_profile`, `render_intent`). Add two more passthrough booleans, both defaulted true so out-of-the-box behaviour is "great":

- `force_black_text` → drives `-dBlackText`
- `preserve_overprint` → drives `-dPreserveOverprintSettings`

Frontend already has the family settings panel; just one new toggle row.

### 4. Verification step

Add a tiny helper `pdf_ops.verify_pure_black_text(path)` that:
1. Rasterises page 1 to a CMYK TIFF via `gs -sDEVICE=tiff32nc`.
2. Samples pixels classified as "near-black" and asserts `C+M+Y < 5%, K > 95%`.
3. Returns the measurement so it lands in `assembly_report.colour_check`.

Operators then see proof in the admin order panel that text is true K-only.

## Files touched

```
pdf-server/app/services/pdf_ops.py                 (grayscale + to_print_ready_cmyk)
pdf-server/app/services/icc_profiles.py            (gray_dotgain15 + object_default.txt path)
pdf-server/scripts/install-icc-profiles.sh         (download Dot Gain 15% + write object_default.txt)
pdf-server/app/tasks/production_tasks.py           (call verify_pure_black_text → report)
src/lib/printIntent.ts                             (extend FamilyPrintConfig with two flags)
src/pages/admin/AdminProducts.tsx (or family tab)  (two toggle rows)
```

## Verification on the VPS

1. Push, restart workers.
2. Force re-assemble INV-00057-3.
3. Download, open in Acrobat → Output Preview → Separations.
4. Expect: **Process Cyan 0%, Magenta 0%, Yellow 0%, Black 100%, Total Area Coverage 100%**.
5. `assembly_report.colour_check` should show `{ near_black_pixels: N, max_cmy_pct: 0.x, min_k_pct: 99.x }`.

## Risks & non-goals

- `-dBlackText` and `-dKPreserve` need Ghostscript ≥ 9.55. Coolify/Ubuntu deploys are on 10.x — confirmed by `gs --version` in `install-ubuntu.sh`. Safe.
- Mixed-colour jobs (colour cover + B&W body) still convert the whole document in one pass. The existing TODO at `production_orchestrator.py:405` ("Per-section greyscale before merge is a planned follow-up") is unchanged — separate ticket.
- ICC bundles are ~2 MB extra in the install script. Negligible.

## References

- Ghostscript `Use.htm` §"Color Conversion and Management" — `BlackText`, `BlackVector`, `KPreserve` flag semantics.
- Ghostscript `UseICC.htm` — source-object ICC config grammar.
- Adobe PDF Print Engine 6 colour spec (object-type rendering intents).
- Fogra/ECI ISOcoated v2 deployment notes (300% TAC variant for digital toner presses — we already ship `fogra39_300`).
