# Keep sample pack customers inside the pack flow

Right now, finishing one sample item drops the customer into the basket with no obvious way back to the pack, so they have to hunt for the sample pack page again.

## What changes

1. **After adding a sample item, go back to the sample pack page** — not the basket. The page already shows which of the three are done, so they simply pick the next one.
2. **When the last item is added, go straight to the basket** instead, since the pack is complete.
3. **Show pack progress while they're designing.** A slim strip at the top of the design screen when they're in sample pack mode: "Sample pack — 1 of 3 done" with a "Back to sample pack" link, so the way out is always visible.
4. **A clear success message**: "Deskpad added — 2 to go" rather than the generic "Added to cart".
5. **Sample pack page gets a finish line**: once all three are done, the page leads with "Your pack is complete" and the basket button, rather than leaving it as one row among the cards.

## Technical notes

- `src/pages/dashboard/TemplatedArtworkBuilder.tsx` and `src/pages/dashboard/UploadedArtworkBuilder.tsx` already read `sample=1` into `samplePack`. Change the post-add `navigate(tenantPath("cart"))` so that when `samplePack` is set it routes to `tenantPath("sample-pack")`, except when this item completes the pack — compare `useSamplePack().doneFamilyIds` plus the family just added against `config.familyIds` — in which case keep the basket.
- Same two files: render a sample-mode header strip above the existing back button showing `doneCount`/`familyIds.length` and a link to `tenantPath("sample-pack")`; toast text derived from the remaining count.
- `src/pages/storefront/SamplePack.tsx`: when `complete`, swap the progress row for a completion panel with the basket call to action.
- No database, pricing or checkout changes — the flat R495 pricing and eligibility guards already in `order-engine` stay exactly as they are.
