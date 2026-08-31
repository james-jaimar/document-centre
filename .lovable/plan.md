# Fix A2 deskpad editor viewport fit

Stop the whole editor page from scrolling so the stage stays centred while only the left controls rail scrolls.

## Problem

`CustomerLayout` renders the editor route inside `<main className="flex-1 overflow-auto ...">`. That makes the entire page scrollable, so when the user scrolls the left-hand placeholder controls, the stage and summary get pushed up and off the viewport.

## Changes

1. **CustomerLayout chromeless scroll behaviour**
   - When `chromeless` is true (storefront or editor mode), remove `overflow-auto` from `<main>` and use `overflow-hidden` instead.
   - Keep `flex flex-col` so the child editor can fill the available height.
   - Non-chromeless routes keep their existing `overflow-auto` and padding.

2. **TemplatedArtworkBuilder height contract**
   - Ensure the root `div` inside the builder uses `h-full` / `min-h-0` so it respects the parent height rather than growing beyond it.
   - The existing three-zone grid (`left rail | stage | summary`) already has `min-h-0` and `overflow-y-auto` on the left rail, which is correct.
   - Confirm the stage canvas uses `maxHeight: 100%` relative to its container and does not force the container taller than the viewport.

3. **Mobile safety check**
   - Verify the mobile path still uses `CustomerMobileLayout` and is unaffected by the desktop chromeless change.

## Files touched

- `src/components/CustomerLayout.tsx` — conditional `overflow-hidden` for chromeless routes.
- `src/pages/dashboard/TemplatedArtworkBuilder.tsx` — height/flex classes on the root editor container only.

## Verification

- Open the A2 deskpad editor on a laptop viewport.
- Scroll the left placeholder panel; the centre stage and right summary should remain fixed in the viewport.
- Resize to a shorter height; the canvas should shrink to fit without page-level scrolling.
