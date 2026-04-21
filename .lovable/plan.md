

## Replace ring binder placeholder with real binder images

### What changes

The current `RingBinderPreview.tsx` is a CSS-drawn placeholder (gray rectangle + 3 fake D-rings). Replace it with the two real photographs the user uploaded so the preview shows an authentic white PVC binder.

### Assets

Copy the two uploads into `src/assets/bindings/`:

| Source | Destination |
|---|---|
| `user-uploads://ring_binder_closed.png` | `src/assets/bindings/ring_binder_white_closed.png` |
| `user-uploads://ring_bind_open.png` | `src/assets/bindings/ring_binder_white_open.png` |

Naming follows the existing convention (`coil_binding_black_closed.png`, etc.) and leaves room for future colours (e.g. black binder).

### Component rewrite — `src/components/preview/RingBinderPreview.tsx`

Two render modes:

**1. Single-page (cover) mode** — `currentPage === 0` or `urls.length === 1`
- Render the **closed** binder image as the background (portrait, ~1:1.05 aspect).
- If a front-cover thumbnail exists, overlay it inside the visible cover pocket window with a small inset margin (the binder has a clear PVC overlay pocket — the doc image sits behind it).

**2. Open spread mode** — `currentPage >= 1`
- Render the **open** binder image as the background (landscape ~2.4:1, with the 4-ring spine visible down the centre).
- Overlay the current page thumbnail on the **right** half of the spread (page area only — clear of the spine and rings).
- Show the previous page on the **left** half if it exists, mimicking a real open binder.
- Apply the existing `colorFlags` grayscale filter per page.

### Geometry constants

Derived from the uploaded images:

```ts
const BINDER_CLOSED_ASPECT = 760 / 800;   // ~0.95 portrait
const BINDER_OPEN_ASPECT   = 1800 / 760;  // ~2.37 landscape
// Inside-page clear area as % of binder image (measured from photo)
const CLOSED_PAGE_INSET = { top: 0.04, bottom: 0.04, left: 0.05, right: 0.05 };
const OPEN_PAGE_INSET   = { top: 0.04, bottom: 0.04, sideMargin: 0.04, spineHalfWidth: 0.06 };
```

Pages on the open spread are positioned: left page from `sideMargin` to `0.5 - spineHalfWidth`, right page from `0.5 + spineHalfWidth` to `1 - sideMargin`.

### Navigation

Keep the existing prev/next chevron + "Page X of Y" footer unchanged.

### Drop legacy placeholder bits

Remove: the gradient border-rectangle, the three CSS D-rings, the four CSS hole-punch dots — all replaced by the real photo. Drop the unused `useState` and `RING_BINDER_COVER_MM` constant references in this component.

### Files changed

| File | Change |
|---|---|
| `src/assets/bindings/ring_binder_white_closed.png` | New — copied from upload |
| `src/assets/bindings/ring_binder_white_open.png` | New — copied from upload |
| `src/components/preview/RingBinderPreview.tsx` | Rewrite to use real binder photos with cover/spread overlay logic |

### Result

Ring binder previews now show the actual white PVC binder — closed view for the cover/page 1, open spread (with visible 4 D-rings down the spine) for any subsequent page — with the user's document thumbnails overlaid in the correct pocket/page positions.

