
## Fix ring binder preview by separating “physical binder cover” from “uploaded cover artwork”

### Core correction

The current implementation is using one flag (`hasRealFrontCover`) for two different things:

- whether the ring binder has a **physical outer/front sheet**
- whether the customer uploaded **printed cover artwork**

For ring binders, the physical front sheet should always exist. The uploaded cover file is optional.

That means the preview model should become:

- **Closed view at page 0 always**
  - show the closed binder artwork every time
  - if the customer uploaded a cover file, place it in the pocket
  - if not, show the same closed binder with a blank outer sheet

- **Open view after page 0**
  - use the same spread/flip logic as wire bound
  - first content page must start on the **right-hand side**
  - pages must keep normal A4 proportions
  - tabs/inserts must keep working exactly like bound documents

### Implementation

#### 1) Always inject a physical front sheet for ring binders
In both the live preview builder and the persisted preview snapshot:

- split the concepts into:
  - `hasPhysicalFrontSheet` → always `true` for `ring_binder`
  - `hasPrintedFrontArtwork` → only true when a real `front_cover` section exists
- always inject the front sheet roles for ring binders:
  - `pvc_cover_front`
  - `pvc_cover_back`
- if there is no uploaded cover file:
  - `pvc_cover_front` should be blank
  - `pvc_cover_back` should be blank
- if there is an uploaded cover file:
  - `pvc_cover_front` uses that thumbnail
  - `pvc_cover_back` stays blank

This fixes two things at once:

- the closed outer view always exists
- the first body page shifts to the correct even/right-hand index after the inner blank face

#### 2) Make the ring binder closed view always render from page 0
In `FlipBook.tsx`:

- remove the current “closed only when a real cover exists” rule
- replace it with:
  - for ring binders, `currentPage === 0` always shows the closed binder artwork
- render a single-sheet overlay inside the pocket rectangle:
  - if page 0 has printable artwork, show it
  - otherwise show a blank sheet surface
- keep this closed state visually separate from the open spread renderer

#### 3) Rebuild the open ring binder state as a wire-bound clone with mapped placement
Still in `FlipBook.tsx`:

- stop using the current ring-specific open-state solo/clipping logic as its own behaviour model
- reuse the same internals as the standard bound preview:
  - fixed `BASE_PAGE_WIDTH` / computed page height
  - same `react-pageflip` setup
  - same solo/spread detection
  - same front/back/last-page clipping behaviour
  - same tab overlay behaviour
- only make ring binders different in two ways:
  - draw the open binder background image behind the stage
  - place the stage into mapped printable left/right rectangles with a wider centre gutter

Use ring-specific geometry such as:

```text
open binder artwork
  left printable rect   -> left page
  centre mechanism gap  -> wider than wire bound
  right printable rect  -> right page
```

This keeps the exact wire-bound flip behaviour while aligning it to the ring artwork.

#### 4) Fix page cropping by scaling into printable rectangles, not the full artwork box
In `FlipBook.tsx`:

- replace the current “content area” fit with page-box fitting
- define explicit normalized page rectangles for:
  - left printable area
  - right printable area
- derive the open-stage scale from those page rectangles so each page keeps the real document aspect ratio
- do not stretch pages to fill a large white content container
- centre the stage inside those mapped page boxes

This removes the heavy crop/floating-white-rectangle look.

#### 5) Make the first inside spread start correctly on the right
Because ring binders will now always have:

- page 0 = outer front sheet
- page 1 = inside front blank sheet

the first body page will naturally land on the first right-hand position in the open spread model.

In addition:

- keep bound stepping at `2`
- keep the existing right-hand tab/insert parity rules
- ensure the ring open state uses the same bound spread indexing as wire bound

This fixes the current “inside starts on the left” issue.

#### 6) Remove the disappearing-last-page bug by using the standard bound end-state logic
The ring branch currently has custom solo-page rules that diverge from the standard bound branch.

Replace those with the same end-of-book rules used by wire/comb/perfect/saddle:

- same last-solo detection
- same back-cover handling
- same clipping/origin rules

With the corrected ring page injection parity, the last page should no longer vanish after turning.

#### 7) Keep page labels and counters aligned with the new physical model
In `PreviewPanel.tsx` and the snapshot builder:

- update ring binder page info to reflect that the preview always has a closed outer state
- keep “Front Cover” available even when the outer sheet is blank
- keep numbering content-only, but preserve the physical sheet parity for the preview engine
- ensure lightbox/main preview remain consistent

### Files to change

| File | Change |
|---|---|
| `src/components/preview/FlipBook.tsx` | Always show closed ring cover at page 0; rebuild open ring state as a mapped wire-bound clone; replace custom ring solo/crop logic with standard bound behaviour plus ring geometry |
| `src/components/order/PreviewPanel.tsx` | Always inject ring front-sheet faces, even when no uploaded cover exists; keep labels/counters aligned with the physical front sheet |
| `src/lib/orders/buildPreviewSnapshot.ts` | Mirror the same always-present ring front-sheet injection and preview metadata so placed-order previews match live preview |
| `src/components/order/PreviewLightbox.tsx` | Only adjust if needed to keep counters/stepping aligned with the updated ring physical sequence |

### Technical details

Use two separate booleans in the ring path:

- `hasPhysicalFrontSheet` = `bindingType === "ring"`
- `hasPrintedFrontArtwork` = first real assigned cover exists

And for ring preview sequencing:

```text
page 0  = closed outer/front sheet
page 1  = inside front blank
page 2  = first body page (right-hand side)
page 3+ = normal wire-bound spread flow
```

### Result

After this rework, ring binders will behave correctly:

- closed front view always appears, even with “No Cover”
- uploaded cover artwork overlays that front when present
- open view starts with the first real body page on the right-hand side
- pages retain proper A4 proportions instead of being cropped into a large white block
- tabs/inserts continue to work because the open state uses the normal wire-bound flip model
- the last page no longer disappears at the end
