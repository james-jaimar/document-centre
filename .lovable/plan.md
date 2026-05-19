## Problem

Page 24 is still full colour because the current B&W pipeline is only proving **page 1 near-black text**, not the whole document. The likely leak is the large page-24 figure/image: it bypasses the current content-stream rewrite, and `mutool convert -O colorspace=gray` is not reliable proof that embedded images/XObjects were converted for PDF output.

Do I know what the issue is? Yes: the verifier is too narrow, and the conversion strategy can accept a candidate even when later pages still contain colour raster/vector content.

## Plan

1. **Add a whole-document colour leak verifier**
   - In `pdf-server/app/services/pdf_ops.py`, add a verifier that samples every page, not only page 1.
   - It will rasterise pages to CMYK at a modest DPI and detect any meaningful C/M/Y content, including images, charts, shadings and XObjects.
   - Report `pages_checked`, `colour_pages`, `worst_page`, `max_cmy_pct`, and a page list such as `[24]`.

2. **Split the B&W checks into two gates**
   - Keep the pure black text gate: black text must still land as 100% K.
   - Add the new page-colour gate: B&W jobs must have no colour-bearing pages.
   - A strategy only passes if both are true.

3. **Replace the primary B&W strategy with full-page K-only conversion**
   - Use Ghostscript to force all content, including raster images, into a monochrome/K-only PDF path.
   - Keep the pikepdf black-text rewrite afterwards so black vector text remains Acrobat-visible `0 0 0 1 K/k`.
   - Keep the existing mutool/GS methods as fallbacks, but do not accept them unless the whole-document colour verifier passes.

4. **Improve `assembly_report.colour_check`**
   - Include both `black_text_check` and `colour_leak_check`.
   - Include per-strategy attempts so failures show exactly which page leaked colour.
   - This will make page 24-style failures visible in the admin report instead of silently passing.

5. **Invalidate cached print-ready PDFs**
   - In `pdf-server/app/tasks/production_tasks.py`, bump `colour_pipeline_version` from `4` to `5` so INV-00057-3 and similar jobs regenerate.

## Verification after deploy

1. Pull the changes and restart the API/workers.
2. Force re-assemble INV-00057-3.
3. Confirm `assembly_report.colour_check.colour_leak_check.colour_pages` is empty.
4. Open page 24 in Acrobat Output Preview and confirm the figure is B&W/K-only, while black text remains Process Black 100%.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>