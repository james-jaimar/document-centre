Do I know what the issue is? Yes — enough to stop guessing.

The regression is app-level in the shared upload/finalisation pipeline, not isolated to loose sheets.

What the live data proves:

- Latest Bound Documents upload: `asset f519dc63-1662-4df0-8027-d4682fa91246`.
- It ran `normalize_orientation` and claimed `pages_rotated: 20`.
- Then it ran `print_ready`.
- The `print_ready` job payload does **not** contain `dominant_orientation`, even though the frontend code intends to pass it.
- The final generated previews for pages 3–22 are landscape:
  - page 1: `1105×1430` portrait
  - pages 3–22: `1430×1105` landscape
  - pages 23–24: `1105×1430` portrait

Same pattern as loose sheets. So the shared pipeline is doing this:

```text
normalize/rotate pages
        ↓
print-ready / Ghostscript rewrite
        ↓
landscape pages reappear
        ↓
asset still reports page 1 as portrait, so UI thinks everything is fine
        ↓
customer sees wrong pages
```

The specific app-level break is that orientation correction was made a shared early/middle step for all required-orientation products, but the later shared `print_ready` step is still allowed to rewrite the PDF without guaranteed orientation enforcement afterwards. The app then trusts top-level asset dimensions, which only reflect page 1, while pages 3–22 are actually wrong.

Plan to fix this without a broad rewrite:

1. Make orientation enforcement the last mutating PDF step
   - In `useDocumentUpload.finalizeOrientationAndPrintReady`, change the order for products with required orientation:

   ```text
   print-ready first
        ↓
   normalize orientation AFTER print-ready
        ↓
   inspect/verify
        ↓
   render previews
   ```

   - This prevents Ghostscript/print-ready from undoing rotation after we already fixed it.
   - Do this for Bound Documents, Ring Binders, Booklets, Stapled/Loose Pages, and Presentations through the existing `orientationPolicy.ts` rules.

2. Stop relying on `print_ready.dominant_orientation` as the only protection
   - The job history shows that field is not reaching the running backend in practice.
   - Keep sending it, but do not trust it.
   - Explicitly call `normalizeOrientation(assetId, requiredOrientation)` after `printReady()` completes.
   - This is the immediate app-level containment fix for bound documents and loose sheets.

3. Add hard preview verification before marking upload complete
   - After `renderDocumentThumbnails`, inspect the generated `derived_files` dimensions.
   - For portrait-required products, every real content preview must have `height > width`.
   - For landscape-required products, every real content preview must have `width > height`.
   - If any page fails, do not silently mark the document ready.
   - Run one repair pass:

   ```text
   normalizeOrientation(final PDF)
        ↓
   clear old renders
        ↓
   render again
        ↓
   verify again
   ```

   - If it still fails, show a real error with page numbers instead of “ready”.

4. Fix the backend contract so future calls are consistent
   - Ensure `PrintReadyRequest.dominant_orientation` is accepted and stored in the job payload.
   - Ensure the running Document Centre API deployment is updated, not just the React app.
   - Add the same final orientation verification inside the PDF server task so this cannot depend only on frontend sequencing.

5. Fix the false-success inspection problem
   - `assets.width_pt` / `height_pt` only prove page 1 orientation.
   - Add per-page orientation diagnostics to the final job result, or force a per-page inspect after finalisation.
   - This prevents the system from saying “portrait PDF” when only page 1 is portrait.

6. Keep bound/ring/presentation preview behaviour intact
   - Do not change the flipbook/ring-binder preview system.
   - Only change the shared upload/finalisation sequence that produces the processed PDF and generated page previews.
   - Bound documents should go back to rotating mixed landscape pages correctly, rather than inheriting the loose-sheets failure.

7. Clean up the earlier risky layers
   - Remove the duplicate early orientation calls once the final-step enforcement is in place.
   - Remove unused/deprecated imports from `OrderFiles.tsx` if they are no longer part of this path.
   - Leave product policy centralised in `orientationPolicy.ts`.

Acceptance checks after implementation:

- Re-upload the same 24-page DOCX/PDF to Bound Documents.
- Pages 3–22 must render portrait after final print-ready processing.
- Re-upload to Stapled & Loose Pages and confirm the same.
- Verify `derived_files` dimensions are portrait for all 24 preview pages.
- Verify final job/result metadata records zero remaining orientation mismatches.
- If the backend is not updated/deployed, the frontend repair/verification still prevents silent success.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>