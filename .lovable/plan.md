
Do I know what the issue is? Yes.

## What’s actually going wrong

This is not mainly a FoldPreview rendering problem now. The current failure is in the multi-panel brochure compose path.

- `src/components/order/PreviewPanel.tsx` builds `outside.urls` / `inside.urls` from `document.thumbnail_urls`
- those values are raw Supabase storage keys, not direct image URLs
- for 4/6-page brochure layouts, `PreviewPanel` calls `composePanelImages(...)` before `DocumentPreview` gets a chance to sign those paths
- `src/lib/thumbnailUtils.ts` then does `new Image().src = url` with those raw keys
- the browser treats them as relative URLs on the current app route, which matches the `...png 404` errors in the console screenshot
- the `Uncaught (in promise) Event` is the failed image load bubbling out of that same compose step

I also checked the dev-server log: no Vite/build failure is showing there. So this is a client-side asset-resolution bug, not a broken build.

The other console items are not the main blocker:
- `A listener indicated an asynchronous response...` = browser extension noise
- stylesheet MIME warning = separate route/resource issue, not the brochure preview path

## Plan

### 1. Fix thumbnail resolution before canvas composition
Create one shared resolver in `src/lib/thumbnailUtils.ts` that:
- passes through `data:`, `http://`, `https://`
- signs Supabase storage keys
- preserves input order

Then use that resolver for the multi-panel compose flow instead of sending raw storage keys into `new Image()`.

### 2. Fix the brochure compose path
Update `src/components/order/PreviewPanel.tsx` so the fold effect:
- resolves `outside.urls` and `inside.urls` to real loadable URLs first
- only then calls `composePanelImages(...)`
- wraps the async compose block in `try/catch`
- logs a brochure-preview-specific error instead of leaving an unhandled rejected promise

This should remove both:
- the PNG 404s
- the `Uncaught (in promise) Event`

### 3. Tighten auto-assign rules
Right now the panel auto-assign button shows for any brochure file with `>= 4` pages, which is too loose.

Update:
- `src/components/order/SectionActions.tsx`
- `src/pages/dashboard/OrderFiles.tsx`

So auto-assign is only offered for supported brochure layouts, for example:
- 2 pages = full Outside + Inside
- 4 pages = 2-panel sheet layout
- 6 pages = 3-panel sheet layout
- unsupported counts should not show “clever” auto-assign

Instead, unsupported counts should show a short guidance hint.

### 4. Verify panel ordering explicitly
Once images load again, confirm the actual panel order used for composition.

Current logic groups pages, but the physical left/right order still needs to be made explicit for the supported designer convention. That should be verified instead of guessed silently.

## Files to update

- `src/lib/thumbnailUtils.ts`
- `src/components/order/PreviewPanel.tsx`
- `src/components/order/SectionActions.tsx`
- `src/pages/dashboard/OrderFiles.tsx`

## Expected result

After this implementation:
- brochure panel images stop 404ing
- multi-panel previews render again
- the console stops throwing the image-load promise error
- auto-assign only appears when the uploaded brochure file matches a supported layout
