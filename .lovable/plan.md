## What's actually wrong

The new order (`INV-00059`, job `3266f54a…`) snapshot was built with our updated code, and its merge directive carries `asset_id: afa2bd25-…` — but `storage_path` is `null`:

```json
"merge_directives": [{
  "kind": "section",
  "asset_id": "afa2bd25-42b2-429b-8ef4-07eb078b6978",
  "file_name": "8pp A4.pdf",
  "storage_path": null,
  ...
}]
```

The asset itself exists and has both paths populated:

```
normalized_storage_path: tenants/…/derived/prepared/79aa11a7-….pdf
source_storage_path:    tenants/…/uploads/…/8pp_A4.pdf
```

Why `storage_path` came out null: the client-side enrichment in `useCart.ts` does `supabase.from("assets").select(...).in("id", assetIds)` from the **browser**. The `assets` table's RLS hides those rows from the customer's anon/auth session, so `assetById` was empty and every `storage_path` fell back to `null`.

Result on the VPS worker (orchestrator's 4-stage resolution):
1. Stage 1 (directive `storage_path`) — null, skipped
2. Stage 2 (`source_assets`) — wasn't emitted because rows had no path
3. Stage 3 (legacy `order_items` → `documents` → `assets`) — `order_items` rows are gone post-checkout
4. Stage 4 (`source_storage_path LIKE '%/<order_item_id>/%'`) — upload paths don't contain `order_item_id`, no match

→ Worker raises "No source PDFs available" → edge function returns 502.

## Fix (two parts, both narrow)

### A. Worker: add asset_id resolution stage (primary fix, unblocks existing order)

In `pdf-server/app/services/production_orchestrator.py` `load_job_bundle`, between current Stage 1 and Stage 2, add **Stage 1b — resolve directives by `asset_id`**:

- Collect every `asset_id` from `merge_directives` (and `source_assets`) where `storage_path` is missing.
- Single `assets` query (service-role, bypasses RLS): `select id, original_filename, normalized_storage_path, source_storage_path where id in (...)`.
- For each directive missing a path, fill it from the asset's `normalized_storage_path || source_storage_path` and keep `section_id → (filename, path)` mapping intact so section ordering still works.

This is robust to any future case where the client couldn't read `assets` — the worker has service-role and is the right place to resolve.

### B. Client: stop relying on RLS-blocked direct asset reads (prevents recurrence)

In `src/hooks/useCart.ts` the `assets` `select(...).in("id", assetIds)` block is the source of `storage_path: null`. Two viable options — picking the simpler one:

**Drop the client-side asset fetch entirely** and just emit `asset_id` in directives. The worker (after Fix A) is now the single source of truth for resolving asset_id → storage_path, which matches the original "snapshot is self-contained enough for the worker" intent without depending on client-visible RLS. We keep `file_name` and `page_count` (already on `documents`), drop the brittle client `assets` query.

This also simplifies `buildSourceAssets` — it only needs `asset_id` + `file_name` + `page_count`.

## Deployment steps

1. Push worker changes; user runs on VPS:
   ```bash
   cd /opt/document-centre-api && git pull
   sudo systemctl restart document-centre-worker-heavy document-centre-worker-light
   ```
2. Click **Assemble** on `INV-00059` — Stage 1b resolves via `asset_id` and succeeds (no re-checkout needed).
3. New orders going forward use the simpler client snapshot + worker resolution path.

## Files touched

- `pdf-server/app/services/production_orchestrator.py` — add Stage 1b
- `src/hooks/useCart.ts` — remove `assets` table fetch + `assetById` map
- `src/lib/orders/buildJobSnapshot.ts` — `buildSourceAssets`/`buildMergeDirectives` no longer require `storage_path` on input docs

## Out of scope

- Async/202 polling refactor of `production-pdf` (still deferred until single-shot path is healthy).
- RLS policy changes on `assets` (not needed — worker-side resolution is the right boundary).
