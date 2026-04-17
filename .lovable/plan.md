

## Goal
Free up the ~2.1 GB sitting in Supabase storage and reset all order/document data to a clean slate. New uploads will go to S3 anyway, so Supabase storage should stay near-empty going forward.

## What gets wiped

### Storage buckets (full empty)
- `document-uploads` — 4,036 objects (~2 GB)
- `documents` — 209 objects (~94 MB)
- `previews`, `proofs`, `uploads`, `assets` — empty or near-empty, wipe to be safe

### Database tables (full truncate)
Order-related (cascading from oldest test data):
- `orders` (6 rows)
- `order_items` (6 rows)
- `documents` (2 rows)
- `document_sections` (1 row)
- `order_jobs`, `order_addresses`, `order_documents`, `order_pricing_snapshots`, `status_history`, `messages`, `job_proofs`, `payments` (all already 0 or near-0)

Document-centre-api processing artifacts (the bulk of the orphaned files):
- `assets` (420 rows)
- `derived_files` (4,349 rows)
- `jobs` (1,413 rows)

### What stays untouched
- `apps`, `tenants`, `branches`, `tenant_memberships`, `tenant_settings`
- `product_families`, `product_options`, `pricing_rules`, `branch_capabilities`
- `profiles`, `user_roles`, `number_sequences`, `suppliers`
- All auth users
- Your platform admin membership

## How

A single SQL "wipe" operation in two steps:

**Step 1 — Database TRUNCATE** (instant, atomic):
```sql
TRUNCATE TABLE
  status_history, messages, job_proofs, payments,
  order_pricing_snapshots, order_documents, order_addresses,
  order_jobs, document_sections, documents, order_items, orders,
  derived_files, jobs, assets
RESTART IDENTITY CASCADE;
```

**Step 2 — Storage objects DELETE** (per bucket):
```sql
DELETE FROM storage.objects 
WHERE bucket_id IN (
  SELECT id FROM storage.buckets 
  WHERE name IN ('document-uploads','documents','previews','proofs','uploads','assets')
);
```

This is fast (storage.objects is just metadata + file refs; the actual blobs get garbage-collected by Supabase shortly after).

## Confirmation needed before running

Two things I want you to confirm:

1. **Wipe everything** (recommended given you said it's all test data) — including the 1 "confirmed" order and 5 drafts, and all 4,036 files. Yes/no.
2. **Storage buckets to keep**: `assets` (currently empty) is sometimes used for tenant logos / branding uploads — it's empty now so safe to clear, but I'll skip if you ever uploaded a tenant logo there. Branding logos in your tenants table use external URLs so this should be fine — confirm.

After this runs, you'll be at ~0 MB Supabase storage, well under the 1 GB free-tier limit, with all your tenants/branches/products/users intact and ready for proper end-to-end testing.

