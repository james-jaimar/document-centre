I found the remaining rotation bug. The upload pipeline no longer auto-rotates the PDF, but the preview still rotates landscape bound documents in `FlipBook.tsx`.

The screenshot matches this exactly: the PDF thumbnail is landscape, then the bound-document preview container applies `rotate(90deg)`, so the page content appears sideways/portrait.

Plan:

1. Remove preview-level page rotation for landscape bindings
   - Update `FlipBook.tsx` so `bindingEdge="top"` no longer rotates the entire preview container.
   - Landscape pages will keep their natural landscape aspect ratio on screen.

2. Render top-bound spreads as stacked landscape pages
   - For `bindingEdge="top"`, change the layout model from side-by-side pages to a vertical stack:
     ```text
     page above
     horizontal binding/spine
     page below
     ```
   - Keep normal portrait/left-bound documents unchanged:
     ```text
     left page | spine | right page
     ```

3. Make the binding spine orientation explicit
   - Update `BindingSpine.tsx` so top-bound binding is drawn as a horizontal strip, not achieved by rotating the whole book.
   - Short-edge landscape presentations will use the dedicated 210mm assets.
   - Long-edge toggle will still reuse the portrait long-edge assets, but rotate only the spine artwork — never the document pages.

4. Preserve uploaded/document orientation across product families
   - Leave the existing upload fix in place: no server-side `normalizeOrientation()` during upload.
   - Ensure presentations, brochures/leaflets, and photo/image PDFs use the authored orientation and only rotate when the user explicitly clicks the advisory rotate action.

5. Audit the preview callers
   - Confirm `PreviewPanel`, `DocumentPreview`, and `PreviewLightbox` pass `bindingEdge`/`landscapeLongEdge` without imposing any extra rotation.
   - Keep ring binder isolated in `RingBinderOpenSpread.tsx`, per the shared preview constraint.

6. Verify with type-checking
   - Run the project type-check/build after changes.
   - Specifically check that standard wire/comb/saddle/perfect portrait previews still render side-by-side and that top-bound landscape previews no longer rotate page content.