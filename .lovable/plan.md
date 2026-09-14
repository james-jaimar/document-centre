# Colour still looks flat: what we use, what's best practice, what to change

## What the print server actually uses today

Three different colour paths exist, and the calendar takes the weakest one.

1. **Ghostscript with ICC profiles** — the strong path. `to_print_ready_cmyk` tries a rich ICC conversion, falls back to a core ICC conversion, then to Ghostscript's built-in tables. It uses the real press profiles (ISO Coated v2 / Fogra 39, PSO Coated v3), relative colorimetric intent, black point compensation, black preservation and overprint preservation. **It is only run by the "print ready" operation for uploaded files. Templated artwork (the calendars, deskpads, planners) never calls it.**
2. **Pillow / LittleCMS per photo** — what the calendar uses. Each photo is converted sRGB → Fogra 39 in Python and saved as a CMYK JPEG.
3. **Naive formula** — the fallback when a profile can't be loaded. This is the genuinely "flat and dark" one.

## Why it can still look flat

Two separate things, both confirmed in the code:

- **The photo is converted, but the page is never told what those CMYK numbers mean.** The JPEG goes into the PDF as plain "DeviceCMYK" with no profile attached and the document has no output intent. So while the numbers are Fogra 39, every viewer, every on-screen preview and any downstream tool treats them as untagged ink values and renders them with a generic, dull conversion. That is exactly the "flat" look, even when the conversion worked.
- **If the profiles aren't present on the running server, everything silently drops to the naive formula.** The profile install is a build step that is allowed to fail without failing the image, and the profiles are downloaded from eci.org at build time. The templated artwork code deliberately swallows the error and logs a warning so a job never fails over colour — so a missing profile looks identical to a bad conversion.
- Nothing else in the calendar pipeline ever runs the Ghostscript ICC pass, so the template's own artwork and the flat brand colours are never colour-managed either.

## Best practice (what a prepress workflow does)

Convert **once**, at the document level, and **declare** the result:

- One conversion to the press profile at the end, not per-image guesswork, with relative colorimetric intent and black point compensation. Ghostscript's colour architecture is built for this and uses LittleCMS underneath, the same engine Pillow uses — the engine isn't the problem, the plumbing is [2](https://ghostscript.readthedocs.io/en/latest/GhostscriptColorManagement.html).
- Keep black text and thin rules as 100% K only, and preserve overprint, so small type doesn't come out as a four-colour mush [3](https://ghostscript.readthedocs.io/en/latest/VectorDevices.html).
- Tag the file: give the PDF an **output intent** naming the press condition (PDF/X-4 style). Untagged CMYK is the classic cause of "it looked fine in Photoshop and dull everywhere else" [4](https://archive.color.org/files/whitepapers/ICC_White_Paper_31_Flexible_colour_management_for_graphic_arts.pdf), and the ECI guidelines are the standard being targeted by the Fogra 39 profile already bundled [5](https://eci.org/lib/exe/eci_whitepaper_1_1_eng.pdf).
- Never let a colour-managed conversion silently fall back to an unmanaged one without telling anyone.

## What I'll change

1. **Prove which case we're in first.** Check the running server's diagnostics (it already reports which ICC profiles it can see) and the job's own log for the "ICC CMYK transform unavailable" warning. That single check separates "profiles missing" from "conversion fine, page untagged", and everything below is shaped by the answer.
2. **Make the profiles non-optional.** Bake them into the server image so the build fails loudly if they're absent, instead of shipping an image that quietly converts colour badly.
3. **Stop converting photos in Python; keep them in sRGB and let one Ghostscript pass convert the finished page.** Same engine, but applied once, to everything on the sheet — photos, template artwork, brand colours and text — with black preservation and overprint intact.
4. **Stamp the output intent** on the finished calendar PDF so the file declares the press condition it was built for, and colour is no longer guesswork for anyone opening it.
5. **Surface a warning on the job** when colour management couldn't be applied, so this never again looks like a mystery.
6. **Verify on a real file**: rebuild the print file for the calendar order and inspect the result — ink values in a known area, one logo per page, output intent present, file size sane.

## Technical notes

- `templated_artwork_assembly.py`: drop `_to_cmyk` from `_encoded_jpeg` (save sRGB JPEG, quality 85, embed the sRGB profile), keep `_cmyk()` for flat fills/text so black stays K-only.
- At the end of `assemble_templated_artwork`, before upload, run `pdf_ops.to_print_ready_cmyk(out_pdf, ..., dest_profile=<family setting or "fogra39">, intent="relative_colorimetric", preserve_black=True)`, then re-stamp Trim/Bleed boxes (that function already snapshots and restores them).
- Add an output-intent step (pikepdf: `/OutputIntents` with the embedded destination profile and `GTS_PDFX` subtype) after the CMYK pass.
- Report fields: add `icc_profile`, `icc_converted`, `colour_warnings` to the assembly report (`to_print_ready_cmyk` already returns `icc_converted`); append to the task's `warnings` list when false.
- `Dockerfile`: remove `|| true` on `install-icc-profiles.sh`, or vendor the `.icc` files into the repo and `COPY` them, so the build can't produce a profile-less image. Add profile presence to the health probe.
- Bump `templated_artwork_pipeline_version` 5 → 6 so cached print files rebuild.
- Expect a slower assembly (one extra Ghostscript pass per job) — acceptable on the heavy worker.
