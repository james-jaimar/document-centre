
You are right — this is not a rendering mystery. I traced the flow from the Fold Type selector to the preview, and the immediate reason the other folds “do nothing” is:

## What is actually going on

The preview engine already has separate specs for:
- `bi_fold`
- `tri_fold`
- `z_fold`
- `gate_fold`

But the live app is almost certainly never reaching those non-bi-fold values.

### Root cause I confirmed
In the live Supabase data for brochure product options, the Fold Type values do **not** match what the preview code expects:

- the seed code expects `metadata.fold_type` like `tri_fold`
- the live DB currently has slugs like `tri-fold-2-folds-6-panels`
- the live DB brochure options are missing `metadata.fold_type`

Then in `src/pages/dashboard/OrderBuild.tsx`, fold resolution currently does:

1. `metadata.fold_type`
2. selected slug
3. normalized label
4. fallback to product family slug

But because the selected slug is always present, step 3 never really helps.  
So for Tri-fold / Z-fold / Gate-fold the code gets a slug like:

- `tri-fold-2-folds-6-panels`

That does **not** match `SLUG_TO_PREVIEW`, so it falls back to:

- product family slug `brochures`
- which maps to `bi_fold`

So the preview keeps receiving `bi_fold`, which is why only half-fold appears to work.

## Plan to fix it

### 1. Fix fold resolution in `OrderBuild.tsx`
Make fold detection robust instead of relying on one exact DB shape.

Resolution order should become:

1. `metadata.fold_type`
2. infer from metadata (`fold_style`, `folds`, `panels`)
3. infer from slug text (`tri`, `z`, `gate`, `bi`)
4. infer from label text
5. only then fall back to family slug

This will make the preview switch correctly even if the DB uses descriptive slugs.

### 2. Add a temporary visible “resolved fold type” indicator
Add a small badge near the preview so we can immediately see whether the UI is actually on:
- `bi_fold`
- `tri_fold`
- `z_fold`
- `gate_fold`

This removes guesswork while verifying the fix.

### 3. Force the brochure preview to remount when fold type changes
Key the fold preview by resolved fold type so React cannot keep stale brochure state when the fold selection changes.

### 4. Normalize the live brochure option data
Repair the underlying brochure `product_options.values` data so each Fold Type option includes canonical metadata such as:

- `metadata.fold_type = "bi_fold"`
- `metadata.fold_type = "tri_fold"`
- `metadata.fold_type = "z_fold"`
- `metadata.fold_type = "gate_fold"`

This makes the system consistent with the seed data and prevents this from breaking again.

### 5. Re-test non-bi-folds only after the fold type is truly propagating
Once the resolved type is correct, verify:
- Tri-fold visibly shows 3 panels and multi-step folding
- Z-fold uses its own fold sequence
- Gate-fold shows the two outer flaps folding inward

If one of those still looks wrong after that, then it becomes a renderer issue. Right now the primary blocker is upstream fold-type resolution.

## Files / data to update

- `src/pages/dashboard/OrderBuild.tsx`
- optionally `src/components/order/PreviewPanel.tsx` for the temporary debug badge
- brochure `product_options` data in Supabase (via migration/data repair)

## Technical details

- `src/components/preview/brochure/brochure-specs.ts` already contains spec builders for tri-fold, z-fold, and gate-fold.
- `src/components/preview/FoldPreview.tsx` already rebuilds specs from `foldType`.
- So the most likely reason “nothing changes” is not the 3D engine itself — it is that `productType` is collapsing back to `bi_fold` before the renderer is even called.
- I confirmed the live DB mismatch directly: brochure Fold Type options are missing `metadata.fold_type`, and their slugs are descriptive labels rather than canonical preview keys.

## Expected result after this fix

- Half-fold keeps working
- Tri-fold, Z-fold, and Gate-fold finally change the preview immediately
- We’ll be able to tell whether any remaining issue is real fold physics, instead of the fold selector silently forcing everything back to bi-fold
