
## Current diagnosis

The recent changes are doing four separate things:

1. `src/hooks/useCart.ts`
   - Enriches checkout jobs before calling `order-engine`
   - Builds `buildJobSnapshot(...)`
   - Dynamically imports `inferPreviewTypeFromJob` and `buildPreviewSnapshot`
   - Tries to attach a rich `configuration.preview` snapshot to each placed job
   - Also kicks off non-blocking document processing after the jobs are built

2. `src/lib/orders/buildJobSnapshot.ts` + `src/components/orders/detail/JobDetailPanel.tsx`
   - Store photo-prints-specific config on the placed job
   - Hide the generic “Files” section for photo prints
   - Render the new `PhotoPrintsAdminGallery`

3. `src/components/orders/detail/PhotoPrintsAdminGallery.tsx`
   - Polls the source `order_item.spec.photo_prints`
   - Shows either:
     - “Preparing print-ready PDF…”
     - a red failed state + Retry
     - or the final Print-ready PDF button

4. `supabase/functions/render-photo-prints/index.ts`
   - Sends photo render work through `pdf-api`
   - Persists success/failure back onto `spec.photo_prints`
   - Attempts to retry rate limits

`supabase/functions/order-engine/index.ts` is also improved, but only once checkout actually reaches the edge function.

## What is actually breaking now

The current checkout failure is most likely no longer `order-engine`.

The user screenshot shows:

```text
Failed to fetch dynamically imported module:
.../assets/buildPreviewSnapshot-BI4pMIx-.js
```

That points directly at this code path in `usePlaceOrder`:

```ts
const { inferPreviewTypeFromJob } = await import("@/lib/orders/inferPreviewType");
const { buildPreviewSnapshot } = await import("@/lib/orders/buildPreviewSnapshot");
```

So the order is failing before `supabase.functions.invoke("order-engine", ...)` even runs.

This means the new preview-enrichment work accidentally made checkout depend on a runtime-loaded hashed chunk. If that chunk is stale/missing after a deploy, checkout dies immediately.

## Fix plan

### 1. Make checkout independent from runtime chunk loading

In `src/hooks/useCart.ts`:

- Remove the critical-path dynamic imports for:
  - `@/lib/orders/inferPreviewType`
  - `@/lib/orders/buildPreviewSnapshot`
- Replace them with one of these safe approaches:
  - preferred: normal top-level imports
  - acceptable fallback: keep them lazy, but move the import itself inside a guarded `try/catch`

The important rule:
- order placement must never fail because a preview snapshot chunk could not load

### 2. Downgrade preview snapshot generation to optional only

Still in `src/hooks/useCart.ts`:

- Keep `configuration.preview` as a nice-to-have enrichment
- If snapshot generation fails for any reason:
  - missing chunk
  - stale deploy
  - snapshot logic error
- then fall back to the minimal preview payload already available:

```ts
{ thumbnails, product_type: previewType }
```

and continue placing the order normally.

Right now the fallback only protects the `buildPreviewSnapshot(...)` call.
It does not protect the preceding dynamic import itself.
That boundary needs to move outward.

### 3. Leave the admin photo gallery changes in place

No rollback needed for:

- `src/lib/orders/buildJobSnapshot.ts`
- `src/components/orders/detail/JobDetailPanel.tsx`
- `src/components/orders/detail/PhotoPrintsAdminGallery.tsx`

Those changes are doing the right job:
- visual operator view
- hiding the generic file text block for photo prints
- polling for the merged PDF state

They are not the reason checkout is aborting.

### 4. Finish the rate-limit fix properly in `render-photo-prints`

The logs show `RateLimitError` being thrown during `fetch(...)`, not just a normal HTTP `429` response.

So in `supabase/functions/render-photo-prints/index.ts`:

- extend `makeDcRequest(...)` to catch thrown fetch errors as well as `res.status === 429`
- detect:
  - `err.name === "RateLimitError"`
  - `err.retryAfterMs`
  - or `Retry after Xms` inside the message
- sleep and retry using the same cap:
  - max 3 retries
  - max 30s delay
- only persist failure after retries are exhausted

That will make the background PDF rendering behave the way the current plan intended.

### 5. Keep `order-engine` diagnostics, but don’t chase them yet

Do not revert the recent `order-engine` logging work.

Once checkout reaches the function again, those tagged errors will be useful.
But based on the current screenshot, the frontend import failure is the blocker first.

## Files to change

| File | Change |
|---|---|
| `src/hooks/useCart.ts` | Remove or guard the dynamic imports for `inferPreviewTypeFromJob` and `buildPreviewSnapshot`; ensure preview enrichment can never block order placement |
| `supabase/functions/render-photo-prints/index.ts` | Retry thrown `RateLimitError` / `retryAfterMs`, not only HTTP 429 responses |
| `src/lib/orders/buildJobSnapshot.ts` | No functional rollback expected; keep as-is unless a smaller adjustment is needed during implementation |
| `src/components/orders/detail/PhotoPrintsAdminGallery.tsx` | No functional rollback expected; keep as-is |

## Expected result after the fix

1. Clicking Place Order no longer depends on loading `buildPreviewSnapshot-*.js` at runtime.
2. Even if preview snapshot enrichment fails, the order still submits.
3. If a real backend issue remains after that, the improved `order-engine` error handling will finally surface the exact failing step.
4. Background photo-print PDF rendering will retry real rate-limit exceptions properly instead of failing immediately.

## Verification

1. Re-open the same cart and click Place Order.
2. Confirm there is no longer any `Failed to fetch dynamically imported module ... buildPreviewSnapshot-*.js` error.
3. Confirm checkout reaches `order-engine`.
4. If order placement still fails, the toast should now show a real tagged backend error like:
   - `order_insert failed: ...`
   - `jobs_insert failed: ...`
   - etc.
5. Place a fresh photo-prints order and confirm `render-photo-prints` survives thrown rate-limit exceptions and eventually fills `merged_storage_path`.
