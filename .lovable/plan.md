# Order System Blueprint Pack for GASA

GASA sits in a different workspace, so its assistant cannot read this project. Instead I will produce a self-contained pack you download from Files and upload into GASA as the starting brief. It carries the orders engine only — not the print machinery, pricing engine, delivery, credit or catalogue.

## What you get

A single folder in your Files, `gasa-order-blueprint/`, containing:

1. **README** — how to hand this to GASA: upload the folder, tell it to read the architecture note first, then apply the schema, then the engine.
2. **Architecture note** — the important one. Written in plain terms: why the system is shaped this way, what an order is, what a job is, why prices are frozen at order time, why statuses live in one map, why every change goes through one server-side entry point rather than the browser, and where the failures were that led to each rule.
3. **Schema file** — one SQL file that creates the order tables, their access rules and the triggers that keep totals and statuses correct, ready to run in GASA's database.
4. **Engine source** — the server-side order function, stripped of everything print-specific, plus the small shared helpers it needs.
5. **Front-end contract** — the shared types, status maps, the read queries and the write calls, so GASA's screens talk to the engine the same way.
6. **Naming map** — tenant → brand owner, branch → (dropped or storefront), job → product line, plus the exact renames applied.

## What travels

- Orders, order jobs, adjustments, addresses, invoices, payment attempts, pricing snapshots, documents, timeline events, status history, payments, number sequences.
- The status model: admin status, customer status, fulfilment status, and the cascade that rolls job statuses up to the order.
- Order numbering per tenant, totals recalculation, invoice numbering.
- The order lifecycle hooks: status-change emails, timeline entries, internal-only notes, payment recording.

## What is deliberately left out

Print/PDF/preflight/imposition, catalogue and pricing rules, delivery zones and rates, credit accounts, supplier mirroring, quotes, sample packs, campaigns. The schema keeps the seams where these plugged in, marked as extension points, so GASA can bolt on apparel equivalents.

## Two-tier, not three

Document Centre is tenant → branch → customer. GASA is brand owner → customer. The pack keeps the tenant layer intact (it is the brand owner) and collapses branch to optional, so nothing breaks if GASA later adds storefronts.

## Technical notes

- Source of truth: `supabase/functions/order-engine/index.ts` (3,526 lines) — the transplant drops the print, quote, supplier-mirror and sample-pack branches, keeping create/update/cancel, status transitions, payment recording, totals sync and timeline writes.
- Schema captured from live: `orders` (59 cols), `order_jobs` (52), plus `order_items`, `order_adjustments`, `order_addresses`, `order_documents`, `order_invoices`, `order_payment_attempts`, `order_pricing_snapshots`, `timeline_events`, `status_history`, `payments`, `number_sequences`. Emitted with GRANTs, RLS and `updated_at` triggers in the required order.
- DB functions carried over: `sync_order_amounts`, `handle_order_jobs_after_write`, `rollup_order_status`, `generate_order_number`, `generate_invoice_number`, `issue_invoice_number`, `next_number`, `sync_order_status_on_submit`, `mark_order_opened`, `map_customer_job_status`.
- Front-end contract from `src/lib/orders/` — `types.ts`, `status-maps.ts`, `queries.ts`, `mutations.ts`, `editability.ts` (print-specific builders excluded).
- `timeline_events.visibility` is only `admin|customer|both`; internal notes use `admin`. Documented explicitly, as it has bitten before.

## Out of scope

No changes to this project. Nothing is deployed to GASA from here — you carry the pack across.
