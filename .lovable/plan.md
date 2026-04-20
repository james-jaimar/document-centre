

## Bug — "Order not found" everywhere

Both customer (`/t/postnet/orders/:id`) and tenant-admin (`/admin/orders/:id`) order-detail pages return "Order not found" for INV-00017 — which exists in DB, has `app_id`, `tenant_id`, `submitted_at`, jobs, pricing — and would be readable under both RLS policies.

## Root cause (verified)

`src/lib/orders/queries.ts:fetchOrderDetail` does:

```ts
.from("orders")
.select("*, branch:branch_id(...), ordered_by:ordered_by_profile_id(id, phone, email, first_name, last_name, display_name)")
.eq("id", orderId)
.single()
```

The `ordered_by:ordered_by_profile_id(...)` embed targets `public.profiles`. But the only foreign key on that column is:

```text
orders_ordered_by_profile_id_fkey  →  auth.users(id)
```

There is no FK from `orders` to `public.profiles`. PostgREST cannot resolve the embed → request fails (PGRST200 / relationship-not-found) → `error` is truthy → both pages show "Order not found".

The `branch:branch_id(...)` embed works fine (real FK to `public.branches`). The customer's `submitted_at IS NOT NULL` and `app_id IS NOT NULL` filters all pass. RLS for both `orders_select_membership` (admin override) and `Users can manage own orders` (customer) allow the read. The whole failure is the broken embed.

## Why we drifted into this

`fetchOrderDetail` was extended over recent fixes to surface "ordered by" phone/email on the OrderedByTab. The embed was written assuming PostgREST can join on the `profile_id` name suffix — it can't without an actual FK. Tests didn't catch it because there was no e2e check on order detail load.

## Fix

### A. Add the missing FK so the embed resolves
One DB migration:

```sql
ALTER TABLE public.orders
  ADD CONSTRAINT orders_ordered_by_profile_fk
  FOREIGN KEY (ordered_by_profile_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;
```

Notes:
- Keeps the existing `orders_ordered_by_profile_id_fkey → auth.users` (profiles already mirror auth.users 1-1). Two FKs on the same column to two different tables is allowed; the embed in PostgREST is disambiguated by the FK constraint name if needed.
- If the dual-FK causes ambiguity for PostgREST, switch the embed alias to use the constraint-name disambiguator: `ordered_by:orders_ordered_by_profile_fk(...)`.

### B. Make `fetchOrderDetail` resilient regardless of relationship state
Even after the FK is added, the order detail should not nuke the whole page if a single embed fails:

1. Drop the inline `ordered_by` embed; fetch the profile row in a separate parallel `Promise.all` step keyed off `order.ordered_by_profile_id`. Same approach already used for jobs/addresses/timeline/messages/payments/documents.
2. Replace `.single()` with `.maybeSingle()` and surface "Order not found" only when `data === null`, not on every error.
3. Add a one-line `console.error("fetchOrderDetail failed", error)` so future regressions are visible in console (the user has already noted log-driven debugging).

### C. Tighten `OrderedByTab` to use the new shape
- Read profile from `data.orderedByProfile` (new field returned by `fetchOrderDetail`) rather than `order.ordered_by`.
- Fall back to order-level `customer_name / customer_email / company_name` (already happens).

### D. Audit other embeds in the same file
While here, scan all PostgREST embeds in `src/lib/orders/queries.ts` and `src/hooks/useOrders.ts` for joins that rely on FKs that may not exist. Concretely verify:

- `order_jobs (... job_proofs (*))` — `job_proofs.job_id → order_jobs.id`? Confirm FK exists.
- `branch:branch_id(...)` — confirmed OK.
- Anywhere else using `name:fk_column(...)` syntax — assert the FK exists in `pg_constraint`.

If any are missing, either add the FK in the same migration or split into a separate fetch.

### E. Cleanup pass on `fetchOrderDetail`
The function already has one ugly bit:

```ts
.then((res) => res.error ? { data: [], error: null } : res) as any
```

— a swallow on `timeline_events`. Delete the cast and the swallow; if the table doesn't exist for a tenant, fix the query, don't hide the error. Reduces "layers of rubbish" the user complained about.

## Files

- `supabase/migrations/<ts>_orders_profile_fk.sql` — add FK from `orders.ordered_by_profile_id → profiles.id`.
- `src/lib/orders/queries.ts` — split the profile fetch out, drop the unsafe embed, swap `.single()` → `.maybeSingle()`, remove the timeline error swallow, add a single `console.error` on failure.
- `src/components/orders/detail/OrderedByTab.tsx` — read from new `orderedByProfile` field.
- `src/pages/admin/AdminOrderDetail.tsx` and `src/pages/dashboard/CustomerOrderDetail.tsx` — pass `orderedByProfile` from the hook through to `OrderedByTab`; show error banner when the query throws (vs the current "Order not found" catch-all that also fires for permission errors).

## Verification

1. Hard-reload `/admin/orders/d5de59d8-13b8-40ca-8cca-e011380c3aac?tenant=c0000000-0000-0000-0000-000000000002` as platform admin → page loads, jobs, pricing, branch info, ordered-by phone all populate.
2. Hard-reload `/t/postnet/orders/d5de59d8-...` as the customer (`james_b_hawkins@me.com`) → same.
3. Cancel/refund/mark-paid actions still work.
4. INV-00012/13/14/15/16 (already cancelled) all open without "Order not found".
5. Open browser console — no PGRST200/relationship errors.

## Out of scope

- Backfilling preview data on INV-00014/15/16 (acknowledged as unrecoverable).
- Refactoring the wider order/draft lifecycle.
- Splitting `fetchOrderDetail` into a typed result interface (worth doing later but not required for this bug).

