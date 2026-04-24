

## Place Order is failing for the photo-prints cart — diagnose & fix

The `demo-bootstrap warning` in the console is a red herring (it's from the `/try` boot path, not from clicking Place Order). The real failure is `order-engine` returning a non-2xx, but it's being swallowed because:

1. The `usePlaceOrder` mutation throws `error` from `supabase.functions.invoke(...)` without surfacing the function's response body — we only see "Edge Function returned a non-2xx status code".
2. `order-engine` itself has not produced any visible logs for this attempt, so we don't yet know which insert/RPC threw.
3. Separately, the previous **render-photo-prints** attempt for this exact cart item failed with `Rate limit exceeded for trace ... Retry after 21186ms` (visible in `order_items.spec.photo_prints.render_error`). That's the Document Centre throttling us — not directly the cause of Place Order failing, but it is a real bug we need to address now.

### Fix — three small, focused changes

**1. Surface the real error from `order-engine` (FE)**

In `usePlaceOrder` (`src/hooks/useCart.ts`), when `supabase.functions.invoke("order-engine", …)` returns an error, read the response body via `error.context.text()` (or `.json()`) and throw a meaningful `Error` so the toast shows the real reason instead of "Edge Function returned a non-2xx status code". This single change unblocks every future diagnosis of this flow.

**2. Add structured logging + per-step error responses inside `order-engine`**

In `supabase/functions/order-engine/index.ts` `createOrderWithJobs`, replace the bare `err(...)` returns with messages that include the failing operation (`order_insert`, `jobs_insert`, `pricing_snapshot_insert`, `addresses_insert`, `timeline_insert`, `membership_upsert`) and `console.error` the raw Postgres error before returning. This means the next failed Place Order will tell us exactly which insert dies, in both the network response body (now surfaced by §1) and the function logs.

No behaviour change on the success path — purely better error reporting.

**3. Make `render-photo-prints` retry on Document Centre rate-limits (instead of giving up)**

In `supabase/functions/render-photo-prints/index.ts`, when the proxied `pdf-api` call returns a 429 with `Retry after Xms`, parse the delay, sleep for it (capped at 30s, max 3 retries) and try again. After the retry budget is exhausted, persist the final error to `spec.photo_prints.render_error` as we do today, so the admin gallery shows the Retry button.

This stops the silent failure the user already saw (`render_error: "Rate limit exceeded for trace … Retry after 21186ms"`).

### What we expect after these changes

- The next "Place Order" click that fails will show the **real DB or RPC error** in the toast and in the function logs.
- We'll then either (a) immediately patch the offending insert in `order-engine` once we know what it is, or (b) confirm the order writes succeed and the FE was misreporting.
- New photo-prints carts won't get permanently stuck in "render failed: rate limit" — the function will back off and retry once or twice before giving up.

### Files to change

| File | Change |
|---|---|
| `src/hooks/useCart.ts` | In `usePlaceOrder`, unwrap `FunctionsHttpError` and throw the actual response body text |
| `supabase/functions/order-engine/index.ts` | Tag every `err(...)` return in `createOrderWithJobs` with the failing step + `console.error` the raw error |
| `supabase/functions/render-photo-prints/index.ts` | Detect 429 + `Retry after Xms`, back off and retry up to 3 times before persisting failure |

No DB schema changes. No customer-facing UI changes beyond a more useful toast message.

### Verification

1. Click Place Order on the stuck cart — the toast now shows a specific message like `"order_insert failed: …"` instead of `"Edge Function returned a non-2xx status code"`.
2. Edge function logs for `order-engine` show one `console.error` line with the failing operation and the Postgres error.
3. Place a fresh photo-prints order — `render-photo-prints` logs one or more `429 Retry after …, sleeping` lines and ultimately succeeds, populating `merged_storage_path`.
4. If Document Centre is genuinely down for the full retry budget, the gallery shows the existing "Render failed — Retry" pill (no regression).

