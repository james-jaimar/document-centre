

## Three fixes

### 1. Admin Order Manager shows drafts (BUG)

**Cause**: `fetchAdminOrders` filters `.not("app_id", "is", null)` but lazy-created drafts already have `app_id` set. The drafts have `order_number IS NULL` and `submitted_at IS NULL`.

**Fix**: in `src/lib/orders/queries.ts > fetchAdminOrders`, add `.not("submitted_at", "is", null)` (and same for `fetchCustomerOrders` for safety). Only truly placed orders have `submitted_at`.

### 2. Auto-clear drafts older than 7 days

Two parts:

**A. Customer-facing notice** — in `src/pages/dashboard/CustomerOrders.tsx`, add a small info banner at the top of the Drafts tab:
> "Drafts are automatically deleted after 7 days. Place your order or save it to your cart to keep it."

Also show each draft's age and visually flag any draft >5 days as "expires soon" so the user has warning.

**B. Server-side cleanup** — add a Postgres function + pg_cron schedule via migration:

- New SQL function `cleanup_stale_draft_orders()` (`SECURITY DEFINER`, `search_path = public`):
  - Find orders where `submitted_at IS NULL` AND `order_number IS NULL` AND `created_at < now() - interval '7 days'`.
  - For each, delete dependent `document_sections`, `documents`, `order_items`, then the order itself (mirror `deleteDraftOrder` client logic). Storage objects in the `document-uploads` bucket: collect file paths and delete via the storage API call from a tiny Edge Function trigger, OR leave orphaned and rely on a separate sweep — recommended: do the DB cleanup in SQL and orphan storage for now (keeps migration pure SQL; storage can be swept by a follow-up edge function).
  - Better: create a small edge function `cleanup-stale-drafts` that does both (DB + storage), and schedule it via pg_cron with `net.http_post` daily at 03:00 UTC.

Approach chosen: **Edge function `cleanup-stale-drafts`** scheduled by pg_cron. Cleaner, deletes both DB rows and S3 storage objects. Logs how many drafts cleared per run.

### 3. Customer order detail — link to read-only flip preview

In `src/pages/dashboard/CustomerOrderDetail.tsx`, for each job:
- Compute thumbnail paths from the job's `documents` (joined via `order_jobs → documents` snapshot, or pulled from `order_documents` filtered by `job_id`). Existing code already loads `documents` into `visibleDocs`.
- Add a "Preview" button next to each job (or inside the Files section) that opens `PreviewLightbox` with the job's thumbnails and the correct `productType` inferred from `job.product_category` / `job.configuration`.
- Reuse the existing `PreviewLightbox` component verbatim — it's already read-only (no edit controls). Pass `productType` from `inferPreviewType` (same util used by OrderBuild).

We need thumbnail paths. The most reliable source post-placement is `order_documents` rows tagged `document_type = 'thumbnail'` or the `documents.thumbnail_urls` array snapshot. Plan:
- Extend `fetchOrderDetail` to also pull `documents` via `order_items` joined through the original draft → not viable (drafts deleted on placement).
- Better: snapshot the thumbnail paths into `job.configuration.thumbnails` at order-engine time, OR write them to `order_documents` with `document_type = 'preview_thumbnail'` and `is_customer_visible = true`.

**Decision**: minimal change — at place-order time in `order-engine`, copy the source `documents.thumbnail_urls` into `order_jobs.configuration.preview` so the customer detail page can read them without any new tables. The flip preview button reads `job.configuration.preview.thumbnails` and `productType` and opens the lightbox.

## Files to change

- `src/lib/orders/queries.ts` — add `submitted_at IS NOT NULL` to admin/customer order list queries.
- `src/pages/dashboard/CustomerOrders.tsx` — add 7-day notice banner on Drafts tab; show draft age.
- `supabase/functions/order-engine/index.ts` — at `createOrderWithJobs`, snapshot per-job thumbnail paths + product_category into `configuration.preview`.
- `src/pages/dashboard/CustomerOrderDetail.tsx` — add "View Preview" button per job; mount `PreviewLightbox` with job thumbnails + inferred productType.
- New migration: create `cleanup-stale-drafts` edge function scaffolding (deploy via existing edge function deploy flow); pg_cron schedule via SQL migration calling `net.http_post` daily.
- `supabase/functions/cleanup-stale-drafts/index.ts` — new function; deletes drafts >7 days old (DB + storage objects).

## Verification

1. Admin Order Manager → only `INV-00012` row is visible; the four R 0.00 draft rows are gone.
2. Customer Drafts tab shows banner "Drafts auto-clear after 7 days"; per-draft age shown.
3. Place an order → open it from Placed Orders → click "View Preview" on the booklet job → fullscreen flip preview opens, no edit UI.
4. Manually invoke `cleanup-stale-drafts` edge function → drafts older than 7 days removed; storage files removed; younger drafts untouched.
5. pg_cron job listed in `cron.job` table running daily at 03:00.

## Out of scope

- Storage sweep for already-orphaned files (one-off, can be done after first cron run).
- Reminder email to customer 24h before draft auto-deletion (nice future enhancement).

