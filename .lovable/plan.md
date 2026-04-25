## Diagnosis

The previous fix to `crop_to_box` and `normalize_orientation` was correct, but I missed the **third operator in the chain** for Office uploads: `resize_pages`. That's where the portrait box is being smuggled back in.

### Actual sequence for the failing document

1. **LibreOffice convert** — produces a clean PDF with portrait pages 1–2, landscape pages 3–22, portrait again at the end. ✅ Correct.
2. **Inspect** — sees Letter (8.5 × 11"), flags the size advisory. ✅
3. **User clicks "Scale to A4"** in the advisory. The first page is portrait, so the client calls:
   ```
   resize(assetId, targetW=210, targetH=297, fit)   ← portrait A4 forced for ALL pages
   ```
4. **`pdf_ops.resize_pages`** (`pdf-server/app/services/pdf_ops.py` line 405) loops every page and does:
   ```python
   target_w = 210 mm; target_h = 297 mm                    # portrait A4 — one box for everything
   scale = min(target_w/src_w, target_h/src_h)            # for landscape src this gives ~0.75
   page.scale_by(scale)
   page.transfer_rotation_to_content()
   new_page = writer.add_blank_page(width=target_w, height=target_h)   # ← portrait canvas
   new_page.merge_transformed_page(page, ...)
   ```
   **Every landscape page is now baked onto a 210 × 297 portrait sheet.** The MediaBox is portrait. The interaction of `scale_by` + `transfer_rotation_to_content` + `merge_transformed_page` on a page that LibreOffice marked with `/Rotate` produces exactly what the screenshot shows: content rotated 90° and the bottom guillotined off because the visible content extends past the new portrait `MediaBox`.
5. **`normalize_orientation`** then runs (dominant=portrait for bound docs), sees every page as portrait (we just made them portrait), and does nothing — so the damage from step 4 is what reaches the renderer.

This is the same class of bug the recent `crop_to_box` fix solved, just in a different operator. Same root cause: **single static target box applied to mixed-orientation pages**.

## Proposed Fix (single file)

### `pdf-server/app/services/pdf_ops.py` — `resize_pages`

Make it **page-aware** so each page is resized onto a same-orientation canvas of the target paper size. Mirrors the pattern we already use in `crop_to_box`:

```python
def resize_pages(self, src, out_pdf, width_mm, height_mm, fit_mode="fit"):
    reader = PdfReader(str(src))
    writer = PdfWriter()
    target_w_base = width_mm * mm
    target_h_base = height_mm * mm
    target_landscape = target_w_base > target_h_base

    for page in reader.pages:
        src_w = float(page.mediabox.width)
        src_h = float(page.mediabox.height)
        page_landscape = src_w > src_h

        # If page orientation disagrees with the target, swap target
        # w/h for THIS page so we keep the page's native orientation.
        if page_landscape == target_landscape:
            tw, th = target_w_base, target_h_base
        else:
            tw, th = target_h_base, target_w_base

        sx = tw / src_w
        sy = th / src_h
        scale = min(sx, sy) if fit_mode == "fit" else max(sx, sy)

        page.scale_by(scale)
        page.transfer_rotation_to_content()

        new_page = writer.add_blank_page(width=tw, height=th)
        tx = (tw - float(page.mediabox.width)) / 2
        ty = (th - float(page.mediabox.height)) / 2
        new_page.merge_transformed_page(page, Transformation().translate(tx, ty))

    with open(out_pdf, "wb") as f:
        writer.write(f)
    return out_pdf
```

### Why this is the right shape

- Portrait letter → portrait A4 (210 × 297). Identical behaviour to today.
- Landscape letter → **landscape A4 (297 × 210)** — keeps the page intact and at the correct aspect ratio.
- The downstream `normalize_orientation` (dominant=portrait) then sees the landscape A4 page, rotates it +90° CW, and rewrites both `MediaBox` and the content stream geometry (the fix we shipped previously). Result: a portrait-oriented sheet whose content is the rotated landscape layout, fully visible.
- Single-orientation documents are unaffected — the conditional just selects the same box every time.

### Why no client-side change

`OrderFiles.handleScaleTo` already records `effective_width_mm` / `effective_height_mm` based on the dominant page orientation. The only thing it gets wrong is *assuming every page matches that orientation*, which is exactly what the server-side fix removes. Client persistence (page_width_mm / page_height_mm) still reflects the dominant orientation, which is correct for downstream pricing — the document is sold as "A4 bound", and individual landscape pages within it are handled by the same orientation normaliser the rest of the pipeline already understands.

## Files to change

- `pdf-server/app/services/pdf_ops.py` — `resize_pages` only

## Deployment

Standard VPS reload after the change is merged:

```
cd /root/document-centre && sudo git pull
sudo systemctl restart document-centre-worker document-centre-api
```

## QA after deploy

Re-upload the same `422101000-PM-01.docx`, click **Scale to A4** when the advisory appears, and confirm in the preview that:

1. Pages 1–2 (originally portrait letter) render as full portrait A4 with no clipping.
2. Pages 3–22 (originally landscape letter) render as portrait A4 with the landscape content rotated 90° and **fully visible bottom-to-top** (no chopped table rows).
3. Final portrait pages render normally.
