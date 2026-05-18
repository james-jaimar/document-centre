## What's actually broken

The worker fix from last turn worked — Celery now picks up `assemble_print_ready_for_job` jobs. They run and fail in ~2s with a real error from the orchestrator:

> `ValueError: No source PDFs available for this job. The customer hasn't uploaded files yet.`

That message is misleading. The files DO exist — I traced the failing job for order `INV-00058` (job `0142640f-...`):

- Asset is present: `assets.id = 77a6bbf4-…`, `normalized_storage_path = tenants/…/derived/prepared/1aaf9c17-….pdf`
- The job's `configuration.source_order_item_id = 067d2c6b-…` matches the upload path of that asset.
- But: `order_items` for this order = **0 rows**, `documents` linked to that item = **0 rows**, `document_sections` table = **0 rows total**, project-wide.

So at checkout/job creation, the cart-side rows (`order_items`, `documents`, `document_sections`) are no longer present by the time the worker runs. The orchestrator's lookup chain (`order_jobs → order_items → documents → assets`) returns empty, and it raises "no source PDFs".

The snapshot in `order_jobs.configuration` only carries **abstract** references — `merge_directives[*].section_id` pointing at `document_sections` rows that no longer exist — so the worker has nothing concrete to render.

## Fix: inline resolved asset/path data into the snapshot

Make `order_jobs.configuration` self-contained at submit time so the worker never needs the cart tables.

### 1. `src/lib/orders/buildJobSnapshot.ts`

Extend each `merge_directives[*]` entry of `kind: "section"` with the already-known concrete fields, and add a top-level `source_assets` array as a flat fallback:

```text
merge_directives: [
  {
    kind: "section",
    section_id: "40e3ac08-…",          // keep for backward compat
    section_type: "body",
    // NEW — resolved at snapshot time:
    asset_id: "77a6bbf4-…",
    file_name: "8pp A4.pdf",
    storage_path: "tenants/…/derived/prepared/1aaf9c17-….pdf",  // normalized if present, else source
    page_count: 8,
    page_range_start: null,
    page_range_end: null,
  },
  { kind: "blank_page", reason: "simplex_cover_back" },
],
source_assets: [
  { asset_id, file_name, storage_path, page_count }   // de-duped, in sort_order
]
```

The function already receives `documents` (with `backend_asset_id`, `file_name`, `file_path`, `page_count`) and `sections` (with `document_id`, `page_range_start/end`). Resolve `storage_path` from the asset's `normalized_storage_path` (fetched alongside, or passed in by the caller), falling back to `documents.file_path`.

### 2. Snapshot input plumbing

`buildJobSnapshot` currently takes `documents` but not their resolved assets. The caller (cart→job conversion) needs to fetch `assets.normalized_storage_path` / `source_storage_path` for every `documents.backend_asset_id` and pass it in via `BuildSnapshotInput` so the snapshot can capture concrete paths. No schema change.

### 3. `pdf-server/app/services/production_orchestrator.py` — `load_job_bundle`

Add a snapshot-first path before the existing `order_items → documents → assets` lookup:

1. Read `job.configuration.merge_directives` and/or `job.configuration.source_assets`.
2. If any directive has `storage_path` → use those directly to populate `asset_paths` and `section_paths` (keyed by `section_id` for `merge_directives` consumers downstream).
3. Only fall back to the current cart-tables query when the snapshot has none.
4. Keep the existing `ValueError` only when both paths yield zero sources, and tighten the message:
   `"No source PDFs in job snapshot and no documents found via order_items lookup (job_id=…, source_order_item_id=…)"`

### 4. Backfill / safety net for existing orders

Existing in-flight orders (like `INV-00058`) already have snapshots without the new fields. Two options, in priority order:

- **(a) Best-effort recovery in the orchestrator**: when snapshot lacks `storage_path` but has `source_order_item_id`, query `assets` for any row whose `source_storage_path LIKE '%/<source_order_item_id>/%'`, sort by `created_at`, and use those. Cheap, fixes pre-existing orders without manual intervention.
- **(b) One-off migration script** (`pdf-server/scripts/backfill_job_snapshots.py`) that fills in `merge_directives[*].storage_path` for jobs in active statuses using the same heuristic.

I'd ship (a) — it handles new edge cases too (e.g. someone clears `order_items` for any reason).

### 5. Tests

Add a unit test in `src/lib/orders/buildPreviewSnapshot.test.ts`-style for `buildJobSnapshot` confirming each `merge_directives[*].section` entry carries `asset_id` + `storage_path`. No backend test infra exists for the orchestrator, so verification will be the live retry on the same `INV-00058` job after deploy.

## Verification

After deploy + VPS pull/worker restart:

1. Click Assemble on `INV-00058-1` (the bound document job we reproduced against). Expect status `completed`, `print_ready_pdf_path` populated, toast "Print-ready PDF generated".
2. Re-run the curl reproduction:
   ```text
   POST https://document-centre-api.jaimar.dev/v1/operations/assemble-print-ready
     { "job_id": "0142640f-0335-4258-b8eb-3019a3e46a10" }
   GET  /v1/jobs/<returned id>  →  status: completed
   ```
3. Open the resulting PDF in the admin Production panel; confirm it's the 8-page A4 source.

## Out of scope (intentionally deferred again)

- The async/202 + polling refactor on `production-pdf` and `useProductionArtefacts`. Not needed once the worker actually succeeds in seconds. Revisit only if real assemblies start exceeding ~30s.
