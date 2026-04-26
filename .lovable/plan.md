## Plan: stop landscape documents being forced into portrait

### What I found
- The main culprit is the upload finalisation path in `useDocumentUpload`: it calls `normalizeOrientation()` automatically for several product families.
- Presentations are currently marked as `landscape` dominant, which should rotate portrait pages to landscape, but the backend API comment and current behaviour strongly suggest the normaliser can still force pages the wrong way or mutate page boxes unexpectedly.
- Bound documents, ring binders, booklets, and brochures are also being auto-normalised to portrait. That means a landscape leaflet/brochure or mixed-orientation upload can be silently changed before the preview renders.
- Photo Prints use a separate flow and do not call the PDF orientation normaliser. Photo rotation there is user-controlled only (`rotation: 0` by default plus the editor Rotate button), but I’ll still verify the crop/preview maths remains untouched.
- The screenshot also shows a preview-layout issue: top-bound presentation preview rotates the whole `FlipBook` container, which can make already-landscape thumbnail artwork appear portrait/sideways on screen.

### Changes to make

1. **Remove silent PDF orientation normalisation**
   - Stop automatically calling `normalizeOrientation()` during upload/finalise for presentations, brochures/leaflets, bound documents, ring binders, and booklets.
   - Keep CMYK/print-ready processing exactly as-is.
   - Rename/adjust the finalisation logic so “print-ready” is not coupled to “orientation normalised”.

2. **Keep presentation orientation as an advisory, not an automatic mutation**
   - Presentations should still detect portrait uploads and show the existing `OrientationAdvisory`.
   - Only rotate when the customer clicks “Rotate 90° to Landscape”.
   - If the uploaded PDF is already landscape, it must remain landscape and proceed without rotation.

3. **Fix stale preflight flags**
   - Stop writing `orientation_normalized: true` when no orientation change has actually happened.
   - Update the advisory resolution paths in `OrderFiles.tsx` so they don’t skip needed print-ready processing because of an old/misleading `orientation_normalized` flag.
   - Preserve useful flags such as `orientation_resolved` and `orientation_action` for the explicit rotate action.

4. **Correct the landscape presentation preview layout**
   - Adjust `FlipBook.tsx` so top-bound landscape documents are laid out as two landscape pages stacked around a horizontal binding without rotating the page artwork into portrait.
   - Keep the dedicated 210mm short-edge binding assets for default landscape presentations.
   - Keep the new “Bind on long edge (top)” toggle, using the rotated/reused portrait binding artwork only for that opt-in mode.

5. **Audit affected product flows**
   - Presentations: landscape PDF remains landscape; portrait PDF prompts user; explicit rotate works.
   - Brochures / folded leaflets: artwork is not auto-rotated during upload; fold preview receives the author’s intended orientation.
   - Photos: no auto-rotation introduced; user rotation remains manual only.
   - Bound documents/ring binders/booklets: no silent page rotation; shared preview changes do not regress left-bound documents or ring binder isolation.

### Technical notes
- Primary files to update:
  - `src/hooks/useDocumentUpload.ts`
  - `src/pages/dashboard/OrderFiles.tsx`
  - `src/components/preview/FlipBook.tsx`
  - potentially `src/components/preview/BindingSpine.tsx` if the top-edge spine placement needs a matching tweak
- I will avoid touching the dedicated Photo Prints crop/rotation code unless the audit reveals a concrete issue.
- After changes, I’ll run the TypeScript check and focus on preserving the existing advisory, bleed, and size-resolution flows.