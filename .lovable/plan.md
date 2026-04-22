
## Fix the ring binder preview by simplifying it to two mapped artwork states

### What the actual issue is

The current ring binder preview is mixing two incompatible models:

- the **binder artwork is being stretched to the flip stage viewport**
- the **pageflip stage is still centered like a normal spread**
- the preview still assumes a **cover state from page index 0**, even when the first real page is body content

That is why you are seeing all three failures at once:

1. **No real front/inside background behavior** because the artwork is tied to the wrong container.
2. **Fake cover appears when no cover exists** because page 0 is still treated like a cover mode.
3. **Inside looks like a saddle/wire spread dumped on top of the image** because the flipping pages are not mapped to the printable rectangles of the open binder artwork.

### Target behavior

Use a much simpler ring binder model:

- **Closed front**
  - show `ring_binder_white_closed.png`
  - if a real cover sheet exists, place that page centered in the front pocket area
  - if no cover sheet exists, do not invent one

- **Open inside**
  - show `ring_binder_white_open.png`
  - run the normal `react-pageflip` spread behavior
  - place the spread into mapped left/right printable areas
  - widen the centre gap to clear the ring mechanism
  - keep the artwork independent from the flip stage so it never squashes

### Implementation

#### 1) Rebuild ring binder layout in `FlipBook.tsx` around artwork coordinates
Replace the current ring-specific approach with a coordinate-mapped layout:

- keep `react-pageflip` as the animation engine
- keep ring binders on the shared `FlipBook` path
- define two ring-binder layouts:
  - `closedArtworkBox`
  - `openArtworkBox`
- define mapped printable regions inside those artworks:
  - `closedPocketRect`
  - `openLeftPageRect`
  - `openRightPageRect`
  - `centerMechanismGap`

The binder artwork should render at its own aspect ratio first.
Then the page content/stage should be positioned on top using those relative rectangles.

#### 2) Split ring binder rendering into two explicit states
In `FlipBook.tsx`, ring binders should render differently depending on whether a real cover exists and whether the current state is front or inside:

- `hasRealFrontCover = pageRoles[0] === "front_cover" || pageRoles[0] === "pvc_cover_front"`
- if `hasRealFrontCover && currentPage === 0`
  - render the **closed binder artwork**
  - render a simple centered page overlay in the pocket rectangle
  - do not mount the spread viewport for this state
- otherwise
  - render the **open binder artwork**
  - mount the standard pageflip spread viewport over the inside page rectangles

This removes the fake front-cover behavior completely.

#### 3) Stop stretching the binder artwork to the book viewport
The current issue comes from this coupling:

- artwork fills `displayedViewportWidth`
- page stage is then clipped/shifted inside that same box

Instead:

- compute artwork display size from the asset aspect ratio
- center the artwork inside the preview area
- compute the page-stage overlay position relative to the displayed artwork bounds
- apply the wider ring gap only to the page overlay, not to the full artwork image

That will keep the cover and inside images visually correct.

#### 4) Map the open spread to left/right printable rectangles
For the inside state:

- treat the ring binder like the wire-bound preview for flipping behavior
- but do not let the spread occupy the full artwork width
- position the spread so:
  - left page sits inside the left printable panel
  - right page sits inside the right printable panel
  - the centre gap aligns with the D-ring mechanism

Use a ring-specific geometry object in `FlipBook.tsx`, for example:

```text
closed:
  pocket rect = { x, y, w, h }

open:
  left page rect  = { x, y, w, h }
  right page rect = { x, y, w, h }
  center gap      = number
```

This is the core fix for the “inside not working” problem.

#### 5) Keep navigation spread-based, but make cover conditional
In `PreviewPanel.tsx`:

- keep `step = 2` for ring binders
- keep normal spread navigation
- only show “Front Cover” when a real cover sheet exists
- if there is no real cover sheet, the first visible state should be the first inside spread
- update `pageInfoText` so body-only ring binders never label page 0 as a front cover or closed binder

In `PreviewLightbox.tsx`:
- keep the same spread stepping as the main preview
- no special single-sheet logic

#### 6) Keep snapshot parity with live preview
In `buildPreviewSnapshot.ts`:

- preserve the existing rule that ring binders only get PVC/front-pocket pages when a real front-cover section exists
- ensure no preview metadata implies a front cover for body-only jobs

That keeps placed-order previews aligned with the live configurator.

### Files to change

| File | Change |
|---|---|
| `src/components/preview/FlipBook.tsx` | Replace current ring-binder stretch/clip logic with artwork-first rendering and mapped overlay coordinates |
| `src/components/order/PreviewPanel.tsx` | Keep spread navigation, but make front-cover labels conditional on a real cover sheet |
| `src/components/order/PreviewLightbox.tsx` | Keep ring binders aligned with spread-based stepping |
| `src/lib/orders/buildPreviewSnapshot.ts` | Preserve no-implicit-cover parity for persisted previews |

### Result

After this rework, ring binders will behave as expected:

- **No cover sheet assigned**: no fake cover, no closed-binder front preview
- **Cover sheet assigned**: closed binder image with a simple centered cover overlay
- **Inside**: real open binder image plus normal flip preview mapped into the printable page areas
- **Centre mechanism**: wider gap between pages for the O-rings
- **No more squashed artwork or saddle-style spread dumped across the whole background**
