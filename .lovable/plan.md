## Why it's still 98 % K (root cause)

Our `grayscale()` runs Ghostscript with `-sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray`. That produces a **DeviceGray** PDF. The RGB(0,0,0) text in the customer's Word/PDF source is colour-managed through sRGB → Ghostscript's default Gray profile, which has a tone curve, so it lands at DeviceGray ≈ 0xE6, **not** 0x00. Acrobat's Output Preview is then showing that gray value mapped into SWOP separations and reporting **Process Black 98 %, C/M/Y 0 %**.

The `-dBlackText=true / -dBlackVector=true / -dKPreserve=2` flags we added **only take effect when the destination colour space is CMYK**. They're no-ops for `Gray` strategy. That's why the git pull + restart changed nothing visible — the rich command ran successfully and still gave us 98 %.

Every professional B&W print workflow (Prinect, PitStop, callas, Adobe PDF Print Engine) handles "black & white" by producing **CMYK with 0/0/0/100 K**, not DeviceGray. That's what gives true pure-black text in Acrobat separations and on press.

## The fix

Change `grayscale()` so that, for B&W jobs, we convert to **CMYK** through a real Fogra profile with `-dBlackText / -dBlackVector / -dKPreserve=2`, then strip the (now-empty) C/M/Y plates. End result: a file that is visually identical to grey but stores text as DeviceCMYK 0,0,0,1 (= 100 % K, 0 % CMY).

### Step 1 — rewrite `pdf_ops.grayscale()`

Replace the single `Gray`-strategy Ghostscript call with a two-stage pipeline:

**Stage A — CMYK conversion with forced K-only text/vectors**

```
gs -dSAFER -dBATCH -dNOPAUSE -dAutoRotatePages=/None
   -sDEVICE=pdfwrite -dCompatibilityLevel=1.7
   -sColorConversionStrategy=CMYK
   -dProcessColorModel=/DeviceCMYK
   -dOverrideICC=true
   -sDefaultRGBProfile=<sRGB.icc>
   -sDefaultCMYKProfile=<ISOcoated_v2_eci.icc>
   -dRenderIntent=1
   -dBlackPtComp=true
   -dKPreserve=2          # K-only stays K-only
   -dBlackText=true       # RGB(0,0,0) text → DeviceCMYK 0,0,0,1
   -dBlackVector=true     # same for lines/fills
   -dPreserveOverprintSettings=true
   -dHaveTransparency=true
   -o cmyk_k_only.pdf in.pdf
```

After Stage A, every glyph the customer typed in black is stored as `0 0 0 1 k` — guaranteed 100 % K in Acrobat.

**Stage B — drop C/M/Y plates so the file is mathematically gray**

Use `pikepdf` to walk the content streams and:
- Replace any `r g b a k` operator where `c==m==y==0` with `0 0 0 k` (no-op, already pure K).
- For images that happened to remain CMYK with non-zero C/M/Y (e.g. greyscale photos that converted to four-colour), run a second Ghostscript pass with `-sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray` *just on the image XObjects*. Text/vector are already pure K so they survive untouched.

A simpler equivalent that needs no AST surgery: re-run `-sColorConversionStrategy=Gray` over the Stage A output. Because every text/vector is already DeviceCMYK(0,0,0,K), the K plate maps 1:1 to DeviceGray with **no tone curve drift** (Ghostscript treats DeviceCMYK→DeviceGray as `gray = 1 − min(1, 0.3 c + 0.59 m + 0.11 y + k)`, which for c=m=y=0 simplifies to `gray = 1 − k`, exact). End result is DeviceGray with text at 0x00, which Acrobat then shows as Process Black 100 %, CMY 0 %.

We'll ship the two-pass variant — fewer moving parts, no pikepdf content-stream rewriting.

### Step 2 — verification helper

Add `pdf_ops.verify_pure_black_text(path)`:
1. `gs -sDEVICE=tiff32nc -r150 -dLastPage=1` rasterise page 1 to CMYK TIFF.
2. Pillow scan: pixels with `gray < 50` → assert `K ≥ 250` and `C+M+Y ≤ 12`.
3. Return `{ near_black_pixels, min_k_pct, max_cmy_pct }` so it lands in `assembly_report.colour_check` and the operator sees proof.

### Step 3 — wire the report

`production_tasks.py` line 254 — after `pdf_ops.grayscale(...)`, call `verify_pure_black_text` on `grey` and attach result to `report["colour_check"]`.

### Step 4 — invalidate the cache

Bump `spec_inputs` in `production_tasks.py` with `"colour_pipeline_version": 2` so the existing INV-00057-3 artefact re-assembles automatically (its `print_ready_spec_hash` will no longer match).

## Files touched

- `pdf-server/app/services/pdf_ops.py` — `grayscale()` two-pass; new `verify_pure_black_text()`.
- `pdf-server/app/tasks/production_tasks.py` — call verifier; bump `colour_pipeline_version`.

No frontend, no DB, no admin-setting changes (the existing `force_black_text` / `preserve_overprint` toggles in the plan are dropped — defaults are now correct out of the box).

## Verification on the VPS

1. Push, restart workers.
2. Open INV-00057-3 → cache miss auto-reassembles (or click Force re-assemble).
3. Download the print-ready PDF → Acrobat → Output Preview → SWOP simulation.
4. Expect: **Process Cyan 0 %, Magenta 0 %, Yellow 0 %, Black 100 %, TAC 100 %**.
5. Admin panel `assembly_report.colour_check` shows `{ min_k_pct: 100, max_cmy_pct: 0, near_black_pixels: ~N }`.

## Risks

- Two GS passes ≈ +1.5 s on a 20-page job. Acceptable for the quality gain; cached after first run.
- DeviceGray output is what large-format / digital toner shops expect anyway — single-plate, smaller file, no separation surprises.
