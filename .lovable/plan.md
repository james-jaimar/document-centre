## Two small frontend fixes

Both issues are in the React layer — no edge function or VPS changes needed.

### 1. Download button does nothing (404 from Storage)

`useProductionArtefacts.signedUrl` calls `supabase.storage.from("documents").createSignedUrl(path)`, but every production artefact (print-ready, imposed, job ticket) is uploaded by the pdf-server worker to **AWS S3** (bucket `jaimar-dev-...-af-south-1-an`), not to Supabase Storage. The path on the latest job is `tenants/72347.../derived/prepared/79aa11a7....pdf` — that key only exists in S3, so the Supabase Storage call returns "Object not found" (the 404 / 400 in the console).

**Fix:** in `src/hooks/useProductionArtefacts.ts`, replace the `supabase.storage.createSignedUrl` call with `getDownloadUrls([path])` from `@/lib/s3Storage` (already used everywhere else for S3-hosted assets). Return the single signed URL from the map.

### 2. "No imposition templates configured" even though templates are assigned

`JobDetailPanel.tsx` passes `productFamilyId` to `<ProductionPanel>` by reading `product_snapshot.product_family_id ?? product_snapshot.family_id`. But the actual snapshot shape (verified against `order_jobs.product_snapshot` for `INV-00059-1`) is:

```
product_snapshot.product_family = { id, name, slug }
```

So both fallbacks are `null`, the picker disables itself, and the "No templates configured" message renders. The 4 assigned templates for family `edce25f3-...` (Bound Documents) are confirmed in `product_imposition_defaults` and would resolve correctly if the right id were passed.

**Fix:** in `src/components/orders/detail/JobDetailPanel.tsx` change the `productFamilyId` prop to also read `product_snapshot.product_family?.id`, keeping the existing fallbacks for older snapshots.

### Files touched

- `src/hooks/useProductionArtefacts.ts` — swap signing helper to S3.
- `src/components/orders/detail/JobDetailPanel.tsx` — extend product family id lookup.

### Verification after implement

1. Reload the order detail for `INV-00059-1`, click the download icon on **Print-ready PDF** → new tab opens the S3-signed PDF.
2. Imposition section shows the 4 assigned Bound Documents templates with the primary preselected; **Impose** button enables.
