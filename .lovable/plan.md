

## Bug 1 — "Source file not found" on Recently Uploaded → Create

### Symptom
User picks a recently uploaded document, picks a product type, lands on the new order page → toast "Source file not found". An empty new draft order (`046d64a3…`) is created anyway.

### Root cause
In `OrderFiles.tsx` (lines 105-157) the copy-from-`fromDoc` effect:
1. Calls `ensureOrder()` first (creates draft order + item).
2. Then runs `.from("documents").select("*").eq("id", fromDocId).single()`.

That SELECT relies on the `documents` RLS policy "Users can manage own documents" which checks `o.user_id = auth.uid()`. The lookup is brittle in three ways:

a) **No tenant filter** — `useRecentDocuments` filters by tenant on the dashboard, but the lookup in `OrderFiles` does not. If the user is now in a different tenant storefront than where the doc was originally uploaded, the doc still passes RLS (RLS is user-scoped), so this isn't the failure — but it is a UX bug: copying a doc from tenant A into a new order in tenant B silently re-uses a `file_path` that lives under tenant A's storage prefix. That's a latent S3-permissions and audit problem.

b) **Race / stale cache** — `recentDocs` is React-Query-cached for the lifetime of the dashboard. If the doc was hard-deleted by `cleanup-stale-drafts` cron (7-day stale rule) or by manual cleanup between dashboard render and click, the lookup returns zero rows and the toast fires.

c) **Order created before the lookup** — even when the lookup fails, an empty draft order has already been created (orphan). This both spams the DB and lands the user on a blank upload page with a confusing error.

### Fix
1. **Move the source-doc fetch BEFORE `ensureOrder`.** If the doc cannot be read (or its tenant differs from the active storefront tenant), show an inline error UI ("That file is no longer available — please upload again") and do NOT create an order.
2. **Tenant guard** — when fetching the source doc, also fetch its `order_items.orders.tenant_id` and compare to `useTenantContext().tenantId`. If different, refuse the copy and explain (the file lives in another store's bucket).
3. **Storage path rewrite** — when the copy is allowed, do not blindly reuse `file_path`. The path is keyed by the source `order_item_id`. Instead, copy the S3 object to a new key keyed by the new `order_item_id` (mirrors the upload key pattern in `useDocumentUpload`). Falls back to inserting the doc row only after the storage copy succeeds. This prevents two order_items pointing at the same physical file (deletion of one wipes the other).
4. **Invalidate `recentDocs` on dashboard mount** so a deleted-cron-doc cannot linger as a clickable ghost.
5. **Better toast** — surface the exact reason (`not_found`, `wrong_tenant`, `storage_copy_failed`) for diagnosability.

## Bug 2 — `recentDocs` query returns docs from already-cleaned drafts

`useRecentDocuments` has no filter on the parent order's `order_status` and no exclusion of orders pending deletion. After the new orphan-cleanup migration (and the daily `cleanup-stale-drafts` cron) docs may still appear in the cache window before refetch.

### Fix
Add `.not("order_items.orders.order_status", "eq", "cancelled")` and add a `documents.deleted_at IS NULL` guard if/when we add soft-delete; for now, rely on (a) refetch-on-focus and (b) the tenant guard above to fail safely.

## Bug 3 — Cross-tenant doc reuse (latent)

A user who has accounts in two tenants currently sees their docs from tenant A on tenant B's storefront dashboard (`useRecentDocuments` filters by tenantId, but only via the `orders.tenant_id` join — that's correct). The actual risk is the `fromDoc` URL param: it can be hand-crafted to copy a doc from tenant A while signed-in storefront is tenant B. Tenant guard in Bug 1 fix closes this.

## Bug 4 — Audit of cross-linked code that touches the same flows

While we're in there, three adjacent issues to verify and patch in the same pass:

a) **`useEditCartItem` (`useCart.ts:220-245`)** clones documents by re-using `file_path` — same pollution problem as Bug 1.3. Each cart-edit creates two doc rows pointing at the same S3 object. When the original cart item is later removed (after the user saves the edit), `s3Delete` could nuke the file out from under the cloned draft.
   - **Fix**: Either skip the file_path duplication risk by (i) marking cloned docs as `metadata.cloned_from_id` and (ii) teaching `s3Delete` paths to refcount, OR (simpler) physically copy the S3 object into a key keyed by the new `order_item_id`. Pick (ii) for consistency with Bug 1.3.

b) **`OrderFiles.ensureOrder` always creates a NEW order even after a previous failed copy.** Add an idempotency guard: if `copyTriggeredRef.current` is true and the previous attempt failed (no docs created), reuse the existing draft order rather than letting the user see an empty page.

c) **Stale-cache invalidations.** When a user deletes a document, removes a cart item, or cancels an order, the following query keys must be invalidated together: `recent_documents`, `recent_order_items`, `cart`, `orders`, `all_orders`. Audit `useCart.ts`, `useOrderBuilder.ts`, and the cancel flow in `order-engine`-callers; add a single helper `invalidateUserOrderCaches(qc)` and call it from every mutation onSuccess.

## Files to change

- `src/pages/dashboard/OrderFiles.tsx` — re-order the copy effect (fetch first, then ensureOrder + S3 copy + insert), add tenant guard, surface error reasons.
- `src/hooks/useCart.ts` — physical S3 copy in `useEditCartItem`; share helper with OrderFiles.
- `src/lib/s3Storage.ts` (or new helper `copyS3Object`) — add a `copyObject` wrapper that calls Edge Function `s3-storage` with a new `op: "copy"` action.
- `supabase/functions/s3-storage/index.ts` — implement `copy` op (CopyObjectCommand) with tenant-prefix validation.
- `src/pages/dashboard/CustomerDashboard.tsx` — invalidate `recent_documents` on mount; tighten `useRecentDocuments` query.
- `src/lib/queryInvalidation.ts` (new) — single helper `invalidateUserOrderCaches(qc)` used by all order mutations.

## Verification

1. From Recently Uploaded, pick a doc → Create → Booklets. New order opens, doc is copied with a NEW `file_path` keyed by the new order_item_id, no toast error.
2. Hand-craft `?fromDoc=<doc-from-other-tenant>` → friendly "this file isn't available in this store" message, no order created.
3. Delete the source order in another tab, then click Create on the now-stale dashboard tile → friendly "no longer available", no orphan order.
4. Edit a cart item → save → original cart item deleted → new draft retains a working file (S3 object survives because each clone gets its own physical copy).
5. Cancel an order → dashboard `recent_order_items` and `recent_documents` refresh immediately (no F5 required).

## Out of scope

- Soft-delete on `documents` (would be cleaner but is a bigger refactor).
- Refcounted S3 deletion (deferred to a future cleanup-cron rewrite).
- Migrating already-duplicated `file_path` rows (one-shot script if/when measurable cost shows up).

