I checked git history, current preview code, console output, and the stored order snapshots for `INV-00070-3` and the screenshot order UUID.

**What I found**
- The actual `FlipBook`/`DocumentPreview` renderer has not changed in the last 2 days.
- `INV-00070-3` is correctly stored as `product_type: saddle_stitched`, so that job should still route to the flipbook.
- The screenshot order `f2589ba0-2889-4f66-b08d-98f94e2f6e9d` is a bound document with `Binding = Wire Black`, but its saved preview snapshot says `product_type: loose_sheets`.
- Its selected binding option has empty metadata (`metadata: {}`), so the current inference path cannot recognise it as wire-bound and falls back to loose sheets.
- The 401 in the console is from Google Analytics / storage signing noise and is not the flipbook routing issue.

**Plan**
1. **Harden preview type inference**
   - Update `src/lib/orders/inferPreviewType.ts` so bound products can be inferred from binding option slugs/labels when metadata is missing.
   - Map common saved values such as `wire-black`, `wire`, `spiral`, `comb`, `ring`, `saddle`, and `perfect` to the correct `ProductPreviewType`.
   - Keep existing metadata-based inference as the first priority.

2. **Apply fallback at render time for existing orders**
   - In both admin and customer order detail previews, resolve the product type through a helper that overrides invalid saved `loose_sheets` snapshots when the job clearly contains a binding.
   - This fixes old orders without needing a database migration or rewriting historical snapshots.

3. **Fix new orders going forward**
   - In checkout snapshot creation (`useCart.ts`), use the hardened inference before persisting `configuration.preview.product_type`.
   - This prevents new bound jobs from being saved as `loose_sheets` when option metadata is missing.

4. **Verify against real data**
   - Re-check `INV-00070-3` and `f2589ba0-2889-4f66-b08d-98f94e2f6e9d` logic after the change.
   - Confirm bound documents route to `FlipBook` and loose sheets/posters/photo prints remain unchanged.

**No database changes**
- I will not mutate orders or snapshots in the database.
- This is a code-side compatibility fix for missing option metadata in saved order snapshots.