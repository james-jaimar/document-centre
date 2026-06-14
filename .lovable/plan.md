# Branch-aware Paper Size Advisory

## Problem
`PaperSizeAdvisory` (the "Non-Standard Paper Size Detected" modal) currently calls `getSuggestedIsoSizes(width, height, familySlug)` which returns a hard-coded ISO list (A5/A4/A3, etc.) and always shows a "Keep original size" option. It never consults the branch's **Document Size** option overrides set in `BranchProductSpecsDialog` (`branch_product_option_overrides`).

So when a PostNet branch disables US Letter + US Legal for Bound Documents and a customer uploads a US Letter PDF, the dialog still offers A5/A4/A3 plus "Keep original (US Letter)" — even though US Letter isn't a spec the branch sells.

## Goal
The scale-target list and the "Keep original" option must be filtered by what the **branch + product family** actually offers (the resolved `Document Size` option values).

## Changes

### 1. `src/components/order/PaperSizeAdvisory.tsx`
- Add prop `allowedIsoSizeNames?: string[] | null` (e.g. `["A4","A5"]`). When provided:
  - Filter `orderedOptions` to only ISO sizes whose `name` is in the allowed set.
  - Hide "Keep original size" if the detected size is **not** in the allowed set (branch doesn't sell that size — customer must scale).
  - If the locked-size flow is active and the locked size is not allowed, still show it (size-lock from earlier files wins; that's a separate consistency issue).
- When the filtered scale list is empty (edge case: branch only sells the originally-uploaded size, or no sizes match), fall back to current behaviour so the user is never stranded with no choice.

### 2. New helper: `src/lib/paperSizes.ts`
- Add `matchIsoNameFromOptionSlug(slug: string): string | null` that maps `a4-210-297mm` → `"A4"`, `us-letter-216-279mm` → `"Letter"`, etc. (parse leading token before the first `-`, uppercase, normalise `us-letter`/`us-legal`).
- Add `detectIsoName(widthMm, heightMm): string | null` returning the canonical ISO name when dimensions match an `ISO_SIZES` entry (used to decide whether "Keep original" should be hidden).

### 3. `src/pages/dashboard/OrderFiles.tsx`
- Pull `branchId` from `useTenantContext()` (already imported elsewhere in this page; verify).
- Use existing `useResolvedProductOptions(productFamilyId, branchId)` to get branch-resolved options.
- Derive `allowedIsoSizeNames` by:
  - Finding the option whose name is `Document Size` (case-insensitive) or whose slug contains `size`.
  - Filtering its values where `is_active !== false`.
  - Mapping each value's `slug` through `matchIsoNameFromOptionSlug` and keeping non-null ISO names.
- Pass `allowedIsoSizeNames` to `<PaperSizeAdvisory />`.

### 4. Out of scope (call out, don't build)
- Filtering `Keep original` when the file is a **non-ISO** size the branch does happen to enable (e.g. branch toggles US Letter on but with surcharge). Today, that's already handled: if the size is enabled, it'll appear in scale list AND keep-original — acceptable.
- Pre-upload blocking. We continue to let the file upload and resolve at the advisory step.
- Tenant-level toggles in `tenant_product_toggles` (those gate whole product families, not sizes).

## Technical Notes
- `branch_product_option_overrides.is_enabled = false` is the disabled signal; `useResolvedProductOptions` already flips `is_active` accordingly.
- No DB / migration changes. No edge-function changes.
- The advisory is the only place the customer picks a target size before processing, so this single fix closes the loop.

## Verification
1. As a customer on PostNet → Bound Documents storefront where branch has disabled US Letter + US Legal, upload a US Letter PDF → advisory shows **A4, A5 only**, no "Keep original".
2. Re-enable US Letter for the branch → advisory now also shows "Keep original (US Letter)".
3. Posters family still shows A2/A1/A0 (no size option configured there → falls back to current behaviour).
4. Locked-size flow (earlier files in the upload already A4) continues to pre-select A4 even if some sizes are disabled.
