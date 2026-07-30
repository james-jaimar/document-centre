## Goal
On a phone, the photo print editor's crop frame extends past the left and right edges, so you can't see the whole crop. Make the editor fully responsive.

## Step 1 — Confirm the cause (not yet verified)
I could not reproduce it in a headless browser (the page needs a signed-in tenant session), so the exact cause is unconfirmed. First action is to reproduce at a 394px viewport with a photo loaded and log the measured container width vs. the computed crop-frame size, so the fix targets the real cause rather than a guess.

Two candidates to check:
- The dialog is `w-full max-w-3xl` with no viewport margin, so the panel spans edge to edge with no gutters.
- `useCropperZoom` falls back to a hard-coded 600×420 crop-frame basis when the container measures 0; if the measurement lands late (or never on a portalled dialog), the crop frame stays 570px wide on a 394px screen — which matches the screenshot.

## Step 2 — Fix (frontend only)
In `src/components/photo/PhotoEditorModal.tsx`:
- Constrain the dialog on small screens: full-width minus a small gutter, capped height, scrollable body, so header/controls/footer stay reachable.
- Replace the fixed `height: 420` cropper area with a responsive height (viewport-based on mobile, 420 on desktop).
- Clamp the crop frame to the measured container so it can never exceed the visible area.

In `src/hooks/useCropperZoom.ts`:
- Only compute a crop frame once real measurements exist (report `ready: false` otherwise) instead of using the 600×420 fallback, and re-snap zoom when the measurement arrives.

Optionally tighten the controls row for narrow screens (buttons wrap cleanly, zoom slider full width).

## Step 3 — Verify
Re-run the mobile-viewport check with a photo open and screenshot the editor to confirm the crop frame, its guides, and the border overlay sit fully inside the screen at 394px, and that desktop layout is unchanged.

## Scope
Presentation only — no changes to crop maths persisted to the order, `croppedAreaPixels` scaling, or backend rendering.
