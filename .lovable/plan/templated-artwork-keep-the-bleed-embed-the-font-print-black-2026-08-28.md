# Templated artwork: keep the bleed, embed the font, print black in K

Three fixes to the production PDF produced for templated-artwork jobs (deskpads etc.).

## 1. The output must keep the base PDF's bleed and crop marks

Status: cause not yet confirmed. The assembly code as written copies the base pages straight
from the supplied PDF and explicitly re-applies the original media/crop/trim/bleed boxes, so
nothing in it obviously crops the sheet. Reading the code alone cannot tell us whether the
loss happened at upload time (a trimmed base PDF is what's actually stored) or during
assembly.

So step one is a measurement, not a guess:

- Download the stored base PDF for that template and print its MediaBox, CropBox, TrimBox and
  BleedBox per page.
- Download the produced print-ready PDF for the same job and print the same four boxes.
- Compare. Whichever stage drops the bleed is the one we fix.

Then apply the fix, plus a guarantee that holds regardless of which stage was at fault:

- Assembly always emits pages at the **base PDF's MediaBox** (never the trim box), and copies
  CropBox, TrimBox, BleedBox and ArtBox through to the output unchanged, on every page and on
  every branch (underlay merge, overlay merge, and the white-knockout raster path — the
  knockout raster is rendered at full page size, not trim size).
- Placeholders stay measured from the trim origin, exactly as they are now, so the on-screen
  proof (which correctly shows only the trim) still matches the printed sheet.
- The assembly report gains `page_size_mm` and `trim_size_mm` so a mismatch is visible in the
  admin panel without opening the PDF.

If the measurement shows the stored base PDF is already trimmed, the fix moves to the admin
template upload instead: store the original file untouched and only use the detected trim box
for measurement and preview.

## 2. Text placeholders print as 100% K, not RGB black

Text is currently drawn with a hex colour, which lands in the PDF as DeviceRGB — so "black"
goes out as a rich/composite build. Change the text renderer so that:

- A colour that is pure black (or near-black, e.g. `#000000`–`#111111`) is written as
  **CMYK 0/0/0/100**.
- Any other colour is converted from hex to CMYK too, so no text ever leaves as DeviceRGB.
- The same rule applies to placeholder background fills.

## 3. Embed the font

Base-14 Helvetica is referenced, never embedded — unacceptable for press. Change to:

- Register **Liberation Sans** (regular/bold/italic/bold-italic) from the container's font set
  as an embedded TrueType face, and use it wherever the style asks for Helvetica/Arial/
  sans-serif. Liberation Sans is metrically identical to Arial/Helvetica, so line wrapping and
  the on-screen proof stay accurate.
- Do the same for the serif and mono branches (Liberation Serif / Liberation Mono).
- Force full embedding (no subsetting surprises) and fail the job loudly if the TTFs are
  missing, rather than silently falling back to an unembedded base-14 face.
- Add a post-assembly assertion that logs every font in the finished PDF along with whether it
  is embedded, into the assembly report.

## Technical notes

- Files: `pdf-server/app/services/templated_artwork_assembly.py` (geometry, colour, fonts),
  possibly `src/components/admin/ArtworkTemplatesTab.tsx` if the base upload turns out to be
  the culprit.
- Fonts come from `fonts-liberation`, already installed in the Docker image; registered via
  `reportlab.pdfbase.ttfonts.TTFont` resolved through `fc-match` so the path is not hardcoded.
- Colour: `reportlab.lib.colors.CMYKColor`; hex→CMYK conversion done locally (no ICC pass), so
  the customer's own supplied artwork is never re-processed.
- Verification: assemble a test job, then inspect the result with `pdffonts` (all embedded) and
  `pdfinfo -box` (page size equals the supplied bleed size, TrimBox present).
