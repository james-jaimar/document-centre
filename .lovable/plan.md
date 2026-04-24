## Goal

Make Photo Prints behave like every other product in the app:

```text
upload → cart → Place Order → order-engine → done
```

No custom edge function. No background "preparing" merge. No retry-PDF UI in the admin gallery. The PDF rendering pieces that other products rely on stay exactly as they are.

## Why Place Order is actually failing right now

The error toast in your screenshot is the truth:

```text
membership_upsert failed: there is no unique or exclusion constraint
matching the ON CONFLICT specification
```

In `supabase/functions/order-engine/index.ts`, `createOrderWithJobs` does:

```ts
admin.from("tenant_memberships").upsert(
  { profile_id, tenant_id, app_id, role: "customer", is_active: true },
  { onConflict: "profile_id,tenant_id,app_id", ignoreDuplicates: true }
)
```

But `tenant_memberships` has no unique constraint on `(profile_id, tenant_id, app_id)`. The only unique index is:

```text
UNIQUE (profile_id, app_id, tenant_id, COALESCE(branch_id, '00…'), role)
```

Postgres rejects the upsert before it even runs. This breaks **every checkout for every product**, not just photo prints. It only "looked photo-prints-specific" because that was the most recent flow you were testing.

## The plan

### 1. Fix the membership upsert (the real blocker)

Two options, doing the second:

- Replace the `upsert` with a defensive `INSERT … ON CONFLICT DO NOTHING` that targets the **existing** unique index `(profile_id, app_id, tenant_id, COALESCE(branch_id,…), role)`, OR
- Replace it with a "select first, insert if missing" pattern so we don't depend on the index shape at all.

Going with the **select-then-insert** approach — it's index-shape independent, costs one extra select on order placement (negligible), and removes a class of recurring "ON CONFLICT spec" bugs.

### 2. Delete the custom photo render pipeline entirely

Remove:

- `supabase/functions/render-photo-prints/index.ts`
- `src/hooks/usePhotoRenderQueue.ts` (no longer referenced)

Stop calling it from:

- `src/pages/dashboard/PhotoPrintsBuilder.tsx` — the background `fetch(...render-photo-prints?async=1)` block
- `src/components/orders/detail/PhotoPrintsAdminGallery.tsx` — the polling, the Retry button, all of `render_failed_at` / `render_error`

The admin gallery becomes a pure read-only preview of the photo entries (thumbnails + size + qty), which is what it was before this whole detour.

### 3. Treat photo prints like any other product at checkout

Photo Prints already does the standard things:

- uploads each image to S3 via `usePhotoUpload`
- creates one `documents` row per photo
- persists `spec.photo_prints` on `order_items`
- calls `useAddItemToCart` exactly like flyers/brochures

Place Order then runs the standard `usePlaceOrder` → `order-engine` path, same as every other product, and the "thumbnails snapshot" enrichment in `useCart.ts` already picks up the photo `documents` rows because they're regular `documents` keyed to `order_item_id`.

We don't need a merged print-ready PDF on order placement. The production team has:

- the original images in S3 (pointed at by each `documents` row)
- the spec snapshot on `order_jobs.configuration` and `order_jobs.product_snapshot`

That's identical in shape to how other products hand off to production.

If a future "Download print-ready PDF" feature is wanted, it gets built as a one-shot **admin-triggered** action against `pdf-api` — not as a background job that runs at checkout. We are explicitly removing that scope from this change.

### 4. Trim the noise added during the last few rounds

- `src/hooks/useCart.ts` — keep the static `inferPreviewTypeFromJob` / `buildPreviewSnapshot` imports and the surfacing of `error.context.text()` on `FunctionsHttpError`. Both are still useful and not the bug. No further changes here.
- `supabase/functions/order-engine/index.ts` — keep the per-step `console.error` and `*_failed:` messages. They just paid for themselves by making the membership bug visible in one cycle.

### 5. Verify that other products still work

The membership fix is the only change that touches the universal checkout path. Quick smoke test after the change:

1. Place a flyers order in the demo tenant → succeeds.
2. Place a photo prints order → succeeds, lands on the order page.
3. Admin opens the photo prints order → sees the per-photo gallery, no Retry button, no "Preparing…" pill.

## Files to change

| File | Change |
|---|---|
| `supabase/functions/order-engine/index.ts` | Replace the broken `tenant_memberships.upsert(... onConflict ...)` with a select-then-insert. Remove `membership_upsert` from the `Promise.all`; do it before/after as a small idempotent block. |
| `src/pages/dashboard/PhotoPrintsBuilder.tsx` | Delete the background `fetch("…/render-photo-prints?async=1")` block in `handleConfirmAddToCart`. |
| `src/components/orders/detail/PhotoPrintsAdminGallery.tsx` | Remove polling, `handleRetry`, retry/failed UI, and references to `merged_storage_path` / `render_failed_at` / `render_error`. Component becomes a clean per-photo preview grid. |
| `supabase/functions/render-photo-prints/index.ts` | **Delete the function.** |
| `src/hooks/usePhotoRenderQueue.ts` | **Delete the file.** No remaining importers after the cleanup. |

No DB schema changes. No customer-facing UI changes beyond the admin gallery losing the Retry/Preparing pill.

## Expected result

1. Place Order works for every product (the membership bug is the silent universal blocker).
2. Photo Prints checkout returns to the cart, then to the orders page, the same way flyers and brochures do.
3. The admin sees the photo gallery with thumbnails, sizes, quantities — and original-image access via the existing `documents` rows.
4. No more "Preparing print-ready PDF…" pill, no more polling, no more bespoke retry surface, no more rate-limit chasing.

## Verification

1. Click Place Order on the current photo-prints cart → succeeds, no toast errors.
2. Place a fresh flyers order → succeeds (regression check).
3. Edge function logs for `order-engine` show no `membership_upsert failed` lines.
4. `supabase/functions/render-photo-prints` no longer appears in the Functions list.
5. Admin view of a photo-prints order shows the per-photo gallery only — no Retry button anywhere.
