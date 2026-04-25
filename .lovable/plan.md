# Fix: mixed-orientation pages getting cropped + sideways

## Root cause (confirmed in code)

I traced your test document end-to-end. The bug is **not** in LibreOffice — the converted PDF is perfect, with portrait pages (1‑9, 12‑13, 16‑17, 19‑21, 23‑24) and genuine landscape pages (10, 11, 14, 15, 18, 22). The damage happens on the VPS in two compounding bugs:

### Bug A — `crop_to_box` blanket-applies one box to every page
`pdf-server/app/services/pdf_ops.py:595` writes the **same** `MediaBox`/`CropBox` to every page in the document:
```python
for page in pdf.pages:
    page.MediaBox = box
    page.CropBox = box
```
The box is determined from page 1 only (inspect on `pdf.pages[0]`, line 140). So a landscape page (842×595) gets its right-hand 247 pt of content guillotined by the portrait box (595×842).

### Bug B — `normalize_orientation` only flips the `/Rotate` flag
`pdf-server/app/services/pdf_ops.py:251` calls `page.rotate(90)`. In pikepdf/pypdf this only writes a `/Rotate` entry into the page dictionary — it does **not** rewrite MediaBox dimensions. So after normalisation:
- The page still has `MediaBox = [0,0,842,595]` (landscape geometry)
- A `/Rotate 90` viewer hint
- The renderer downstream sees stale landscape dimensions and the rotation flag, then your portrait crop chops off content **and** the rotation flag rotates the result → exactly the sideways, cropped page in your screenshot.

### Bug C (latent) — `inspect` only reads page 1
`pdf-server/app/services/pdf_ops.py:138` only looks at `pdf.pages[0]`, so the client never learns the document has mixed orientations. There is no way for the UI to make an informed decision.

## Why this didn't surface for PDF uploads
A PDF authored in InDesign / Word's "Save as PDF" with mixed orientations has the same vulnerability, but most user PDFs the system has seen so far were single-orientation, so the bug was masked. The Word file you uploaded (with portrait → 12 landscape → portrait sequence) is the first one that exposes it cleanly.

---

## Plan

### 1. Make `crop_to_box` page-aware (`pdf-server/app/services/pdf_ops.py`)

Change the signature to accept an optional reference orientation and apply the box per-page:

```python
def crop_to_box(self, src, out_pdf, box):
    bw, bh = box[2] - box[0], box[3] - box[1]
    box_landscape = bw > bh
    with pikepdf.open(src) as pdf:
        for page in pdf.pages:
            mb = page.MediaBox
            pw, ph = float(mb[2] - mb[0]), float(mb[3] - mb[1])
            page_landscape = pw > ph
            # Use the requested box as-is when orientation matches,
            # otherwise swap so width/height align with the page.
            if page_landscape == box_landscape:
                eff = box
            else:
                eff = [box[0], box[1], box[0] + bh, box[1] + bw]
            page.MediaBox = eff
            page.CropBox = eff
            for attr in ('TrimBox', 'BleedBox'):
                if attr in page:
                    del page[f'/{attr}']
        pdf.save(out_pdf)
    return out_pdf
```

This makes every page get a box that **matches its own orientation**, so landscape pages keep their landscape canvas instead of being chopped to portrait.

### 2. Make `normalize_orientation` actually rotate geometry (`pdf-server/app/services/pdf_ops.py`)

Replace the `page.rotate(90)` call with a real geometry swap so downstream code sees the new dimensions:

```python
if needs_rotate:
    mb = page.MediaBox
    x0, y0, x1, y1 = float(mb[0]), float(mb[1]), float(mb[2]), float(mb[3])
    w, h = x1 - x0, y1 - y0
    # Swap dimensions in MediaBox + CropBox; clear /Rotate so the page
    # is "physically" the new orientation (no viewer rotation hint).
    new_box = [0, 0, h, w]
    page.MediaBox = new_box
    page.CropBox = new_box
    for attr in ('TrimBox', 'BleedBox', 'ArtBox'):
        if attr in page:
            del page[f'/{attr}']
    if '/Rotate' in page:
        del page['/Rotate']
    page.rotate(90)  # writes new /Rotate AFTER the geometry swap
```

(We keep `page.rotate(90)` at the end so PDF viewers display the content right-way-up; the key change is that MediaBox now reflects the new outer geometry.)

### 3. Inspect every page, not just page 1 (`pdf-server/app/services/pdf_ops.py`)

Add a `pages` array to the inspect result so the client can see mixed orientations:

```python
info["pages"] = []
for p in pdf.pages:
    mb = p.MediaBox
    info["pages"].append({
        "width_pt": float(mb[2] - mb[0]),
        "height_pt": float(mb[3] - mb[1]),
        "rotate": int(p.get("/Rotate", 0) or 0),
    })
info["mixed_orientation"] = (
    any(p["width_pt"] > p["height_pt"] for p in info["pages"]) and
    any(p["width_pt"] < p["height_pt"] for p in info["pages"])
)
```

The existing top-level `width_pt` / `height_pt` / `boxes` fields stay (still based on page 1) so we don't break callers.

### 4. Reconfirm pipeline order is correct (no client changes needed)
The order you asked for last turn — **Office → convert → inspect → size advisory → finalise (resize then orientation) → render** — is already wired up correctly in `useDocumentUpload.ts`. With the three VPS fixes above, that flow will produce:

- LibreOffice converts → mixed-orientation PDF (correct)
- Inspect reports per-page sizes + `mixed_orientation: true`
- Size advisory (Letter→A4) scales each page proportionally to its own orientation (the resize op already does this — it doesn't have the same bug because Ghostscript handles per-page scaling)
- For bound documents, `normalize-orientation` rotates landscape pages to portrait **and updates their MediaBox**
- `crop_rasterize` applies a portrait box to portrait pages and (if any landscape remained) a swapped box to landscape pages

Result: each page renders at full fidelity in its correct orientation, no cropping.

### 5. Optional follow-up (not in this turn)
We could later surface a "this document has mixed orientations — keep, normalise, or split into sections?" advisory using `mixed_orientation` from #3, similar to the existing portrait/landscape advisory for presentations. Out of scope for the bug fix — flag it for a follow-up.

---

## What needs to happen after the code change

The fix is entirely in `pdf-server/app/services/pdf_ops.py` (3 functions). After approving:
1. I'll edit the file
2. You `git pull` on the VPS and `systemctl restart document-centre-worker document-centre-api`
3. Re-upload the same Word file — landscape pages (10, 11, 14, 15, 18, 22) should render full-width in landscape, the rest in portrait, no cropping anywhere.

No DB migration, no edge function changes, no client changes.