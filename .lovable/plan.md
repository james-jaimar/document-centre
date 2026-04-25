# Root cause (definitive)

Every previous fix has been geometry-aware but **rotation-blind**. LibreOffice exports landscape Word/PowerPoint pages as a **portrait MediaBox (e.g. 595×842) plus `/Rotate 90`** rather than a true landscape MediaBox. So when `pdf_ops.py` reads:

```python
page_landscape = page.mediabox.width > page.mediabox.height
```

…it sees `595 > 842 == False` and concludes the page is **portrait**, even though it visually renders as landscape.

Consequences for this Word doc:
1. **`inspect`** flags the file as portrait-only → `mixed_orientation = false`. The client never knows there's a landscape page.
2. **`resize_pages` (Scale to A4)** picks the portrait A4 target (210×297) for the landscape page, scales the visually-landscape content into a portrait box → content gets letterboxed/sheared. `transfer_rotation_to_content()` then bakes the `/Rotate 90` into the content stream, but the canvas it lands on is already the wrong shape → **bottom of the table is clipped**, exactly as your screenshot shows.
3. **`normalize_orientation`** sees `w < h` → "already portrait" → no-op.
4. **`crop_to_box`** has the same bug — it would crop the landscape page with a portrait box if invoked.

This is why our last patch (page-aware target swapping in `resize_pages`) didn't help: the orientation comparison itself was wrong.

# The fix

Introduce a single helper and use it everywhere orientation is computed:

```python
def _effective_dims(page) -> tuple[float, float]:
    """Return (width, height) of the page AS IT VISUALLY RENDERS,
    honouring /Rotate. /Rotate 90 or 270 swaps width/height."""
    mb = page.MediaBox
    w = float(mb[2]) - float(mb[0])
    h = float(mb[3]) - float(mb[1])
    rot = int(page.get("/Rotate", 0) or 0) % 360
    if rot in (90, 270):
        return h, w
    return w, h
```

(Equivalent helper for pypdf's `page.mediabox` + `page.get("/Rotate")`.)

Then update **four call sites** in `pdf-server/app/services/pdf_ops.py`:

### 1. `inspect` (lines 161–183)
- Compute per-page `width_pt` / `height_pt` from `_effective_dims` so the client sees the visual orientation.
- Keep `rotate` field for diagnostics.
- `mixed_orientation` now correctly fires for the Word doc.

### 2. `resize_pages` (lines 405–459) — the screenshot bug
- Use `_effective_dims` to compute `page_landscape`.
- For pages with `/Rotate` set: call `page.transfer_rotation_to_content()` **first** so `page.mediabox` then reflects the visual geometry, and the existing scale/translate math operates on a coherent post-rotation page. This guarantees the landscape page is scaled into the (now correctly-swapped) landscape A4 canvas without clipping.

### 3. `normalize_orientation` (lines 251–311)
- Use `_effective_dims` to decide `is_landscape`.
- When rotating, also bake any pre-existing `/Rotate` into the content via pikepdf rather than just adding to the rotate hint, so the geometry rewrite (`new_box = [0, 0, h, w]`) reflects the true visual size.

### 4. `crop_to_box` (lines 667–699)
- Use `_effective_dims` so a landscape-but-`/Rotate 90`-portrait-MediaBox page still gets a landscape crop box.

# Expected outcome

For your `422101000-PM-01.docx`:
- LibreOffice converts it (landscape table page emitted as 595×842 + `/Rotate 90`).
- `inspect` reports the page as 842×595 visual → `mixed_orientation: true`.
- "Scale to A4" puts the landscape page on a **landscape A4** canvas (297×210), scaling the table to fit fully — **no clipping**.
- `normalize_orientation` ("portrait dominant") then rotates that landscape A4 page 90° CW into a portrait A4 with the table content intact, just rotated for binding.
- The preview shows the full table, no chopped bottom row, no missing page number.

# Files to edit

- `pdf-server/app/services/pdf_ops.py` — add `_effective_dims` helper + update `inspect`, `resize_pages`, `normalize_orientation`, `crop_to_box`.

# Deployment

After the patch lands you'll need:

```bash
cd /root/document-centre && sudo git pull
sudo systemctl restart document-centre-worker document-centre-api
```

Then re-upload the Word doc and pick **Scale to A4** to verify.

# Memory update

Add a short note to `mem://infrastructure/pdf-box-rendering` (or a new file) capturing: *"All server-side orientation checks must use effective dims (MediaBox + /Rotate), not raw MediaBox — LibreOffice exports landscape Office pages as portrait box + /Rotate 90."* So this trap doesn't get re-introduced.
