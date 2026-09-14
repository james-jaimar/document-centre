# Calendar output: duplicate logo, huge files, flat colour

Three separate faults in the print-file builder, all confirmed by reading the code and the actual job data for order 27EDIT-13004.

## 1. The logo prints twice on every page (confirmed)

The 2027 calendar template has two logo boxes: a large one that belongs on the cover only, and a smaller one for the twelve month pages. When a logo is dropped in, both boxes receive it — correct.

The builder honours "this box only appears on page X" for pictures it re-draws, but the branch that places uploaded PDFs as true vector art skips that check entirely. So the cover-only logo is stamped on all thirteen pages, on top of the month-page logo. The job record proves it: 13 pages, 26 logo placements, two per sheet.

Fix: apply the same page-scope test in the vector placement branch. Result: cover logo on the cover, month logo on the months, one logo per page.

## 2. File size

Each placed photo is already capped at 300 dpi, but two things still inflate the file:

- When a job uses a different picture per page, the encoder cache is kept separately per page, so a picture that repeats is embedded again for every sheet it appears on.
- Photos are saved at JPEG quality 92; 85 is press-indistinguishable and roughly halves each image.

Fix: key the encoder cache on the picture itself (content + placed size) rather than per page, so any repeat embeds once; drop photo quality to 85. Then measure a rebuilt 13-page calendar and report the before/after size.

## 3. RGB to CMYK looks flat

Photos are converted with Pillow's built-in conversion, which is a naive formula with no colour profile — that is why it looks dull and dark. The server already ships proper ICC profiles (`app/services/icc_profiles.py`: sRGB source, ISO Coated v2 / Fogra 39 press profile) and uses them elsewhere.

Fix: convert photos through those profiles with Pillow's colour-management module (relative colorimetric, black point compensation), and fall back to today's behaviour if a profile is missing so a job never fails over colour. Brand colour swatches and text already emit exact CMYK ink values and stay as they are.

## Technical notes

- File: `pdf-server/app/services/templated_artwork_assembly.py`
  - Vector loop at the per-page `for d in defs:` block — add `if not _def_on_page(d, page_index): continue`.
  - `_encoded_jpeg` cache key: include an image identity (e.g. `id(img)` replaced by a content hash) instead of relying on the per-page cache dict; remove `jpeg_cache_by_page`.
  - `_to_cmyk`: route through `ImageCms.buildTransformFromOpenProfiles(srgb, fogra39, "RGB", "CMYK", renderingIntent=1, flags=BLACKPOINTCOMPENSATION)` using `resolve_profile()`; keep the current `convert("CMYK")` as fallback.
  - Bump `templated_artwork_pipeline_version` in `pdf-server/app/tasks/production_tasks.py` (4 → 5) so cached print files rebuild.

## Verification

Re-run assembly for job 27EDIT-13004-1 and check: one logo per page in the right place, `vector_placements_stamped` = 13 not 26, output file size, and a visual check of a photo page against the on-screen proof.
