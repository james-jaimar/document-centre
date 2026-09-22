# Clean up the South African storage bucket

Free the ~17 GB of test material in the Cape Town bucket, keeping only what the
two live Impress Print orders (CAL-26004 and CAL-26005) and the live sites need.

## What I found

- The bucket has 17 top-level folders. Only one of them, `tissue/`, belongs to
  another app — it will never be touched.
- The two live orders keep their customer artwork in `artwork-uploads/`, plus
  generated previews, thumbnails and print-ready versions produced from it.
- Almost all of the bulk is generated preview and thumbnail images: about
  16,400 generated files against only 24 customer uploads on record.
- 113 orders exist in total across the demo, PostNet, Jetline, 3@1, Printworx,
  2027 Edition and Impress Print shops. All but the two named are test orders.

## What gets kept

- Everything belonging to CAL-26004 and CAL-26005: the customer PDFs, and every
  preview, thumbnail and print-ready file generated from them.
- Shop branding: logos, artwork templates, calendar and email pictures, stock
  images and anything else referenced by a shop's settings or an email template.
- The other app's folder (`tissue/`) — untouched, not even listed.
- All order records, invoices and history in the database. Nothing is deleted
  from the system itself, only the stored files.

## What gets deleted

Every other stored file: test customer uploads, and all the generated previews,
thumbnails, converted, cropped and print-ready copies made from them.

Effect afterwards: old test orders stay in the admin lists with their details
and pricing intact, but their artwork previews will be blank and their files
can no longer be downloaded. The two live orders are unaffected.

## How it will work

1. A new platform-admin screen under Platform → Document Centre → Storage, with
   two buttons: **Preview cleanup** and **Delete**.
2. **Preview cleanup** lists the whole bucket, works out the keep list, and
   reports how many files and how many gigabytes would go, grouped by folder,
   with a sample of paths. Nothing is deleted.
3. **Delete** does the same calculation again from scratch, then removes the
   files in batches, reporting progress and any failures.
4. The keep list is rebuilt from live data every run, so it can never go stale.

## Technical notes

- New edge function `storage-cleanup` (platform-admin gated, same check as
  `wipe-storage`), with `mode: "dry_run" | "delete"`.
- Keep set is assembled from: the source path and all derived paths of the two
  live orders (`documents`, `order_jobs.configuration.raw_spec.uploaded_artwork`,
  `assets`, `derived_files` reached through the asset id); every S3 path found
  in `tenant_settings`, email templates, stock image records and product/family
  artwork templates; and the fixed protected prefixes `tissue/`,
  `artwork-templates/`, `production/`.
- Listing uses ListObjectsV2 through the existing AWS S3 connection, paginating
  on `NextContinuationToken`, accumulating key and size.
- Deletion reuses `supabase/functions/_shared/s3Delete.ts` (direct SigV4, 204
  and 404 both count as success), in batches, with a cap per invocation so the
  function never times out; the screen calls it repeatedly until done.
- Matching bookkeeping rows in `derived_files` and `assets` are removed for
  deleted objects so the print server does not hand out dead paths. `orders`,
  `order_items`, `order_jobs`, `documents` and invoices are left alone.
- Dry run writes nothing at all.
