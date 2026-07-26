# Branch pricing spreadsheet — Export / Edit / Re-import

Goal: let a branch owner get every price they'll ever charge into one nicely-formatted Excel file, edit it in the tool they already know, and re-upload it. Anything that changes is diffed, applied atomically, and can be rolled back with one click.

## User flow

1. Branch Pricing page gets a header bar with two buttons: **Download pricing (.xlsx)** and **Upload updated pricing**.
2. On download, we first run `ensure_branch_pricing_seeded` so nothing is missing, then generate the workbook server-side and stream it. Filename: `{branch-slug}-pricing-{YYYY-MM-DD}.xlsx`.
3. Owner edits in Excel. Sell + cost are editable (ex-VAT). Identity columns (IDs, size code, paper code, variant code) are locked/hidden — used only for matching on re-import.
4. On re-upload: parse → diff against live DB → show a **Review changes** modal listing every changed cell (tab, row label, old → new, currency). Owner clicks **Apply**.
5. Apply writes all changes inside a single Edge Function call. We snapshot every affected row *before* the write into `branch_pricing_import_snapshots`. A green toast shows "247 prices updated" with an **Undo** action good for 24h.

## Workbook layout (one tab per pricing surface)

Every tab has the same shape: locked identity columns on the left (grey fill), `Sell (ex VAT)` and `Cost (ex VAT)` on the right (blue = editable, per the xlsx skill's finance convention). Currency format `R#,##0.00;(R#,##0.00);-`. Frozen header row, autofilter, column widths tuned per tab.

- **Read me** — one-pager: what to edit, what not to touch, VAT note, currency, how to re-upload.
- **Paper prices** — Size, Paper, Sell, Cost. Source: `catalog_paper_prices` scoped to branch.
- **Finishing prices** — Finishing item, Basis (per sheet / per set / …), Sell, Cost. Source: `catalog_finishing_prices`.
- **Click charges** — Size (A4/A3), Colour (Mono/Colour), Sides (Simplex/Duplex), Variant, Sell, Cost. Source: `rate_card_clicks` + `rate_card_price_breaks` for quantity tiers.
- **Photo prints** — Size, Paper/Finish, Sell, Cost. Source: `rate_card_photo_prints` (+ breaks).
- **Business cards** — Stock, Sides, Sell, Cost. Source: `rate_card_business_cards` (+ breaks).
- **Pack pricing** — one row per (Product, Size, Paper, Sides, Quantity). Sell, Cost. Source: `product_pack_pricing_overrides`.
- **Variant overrides** — Product, Variant, Size, Quantity, Sell, Cost. Source: `product_price_overrides`.

Uppercase display for size codes (DL, A4…). Product/paper/finishing/variant names use their display names; codes live in hidden ID columns so renames don't break re-import.

## Import matching & safety

- Match by hidden `row_key` column (stable composite: `table:id` or `table:composite-hash`) — not by display name, so renaming a paper never orphans a row.
- Rows the user deletes from the sheet are **ignored** (no destructive deletes from import). Adding new rows is not supported in v1 — new SKUs still come from the catalogue editors.
- Validation before apply: numeric ≥ 0, cost ≤ sell warning (not blocker), currency consistent.
- Diff modal groups by tab, colour-codes increases/decreases, shows totals ("18 paper prices, 4 click charges, 225 pack rows").
- Apply is one atomic Edge Function call. On any row error the whole batch aborts and nothing is written.

## Undo

New table `branch_pricing_import_snapshots` stores the pre-image JSON of every row the import touched, plus branch_id, uploaded_by, filename, applied_at. Undo re-writes those rows verbatim and marks the snapshot reverted. Snapshots older than 30 days are pruned by the existing nudge/cron worker.

## Technical details

### New files
- `supabase/functions/branch-pricing-export/index.ts` — auth-checks branch membership, calls `ensure_branch_pricing_seeded`, reads all seven surfaces, builds workbook with `xlsx` (SheetJS via `npm:` specifier), returns as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- `supabase/functions/branch-pricing-import/index.ts` — accepts multipart upload, parses, produces diff (returned to client if `?mode=preview`), or applies + snapshots (if `?mode=apply`).
- `supabase/functions/branch-pricing-undo/index.ts` — reverts a snapshot by id.
- `src/components/pricing/BranchPricingIO.tsx` — the header bar with Download / Upload / Review-diff modal / Undo toast.
- `src/lib/pricing/workbookSchema.ts` — single source of truth for tab definitions (columns, row-key builders, table mappings) shared conceptually between export and import (edge function has its own copy; kept structurally identical).

### Edited files
- `src/pages/branch/BranchCatalogPricing.tsx` — mount `<BranchPricingIO />` above the existing editors.
- `src/hooks/useEnsureBranchPricingSeeded.ts` — export a `seedNow()` mutation the export button can await before download.

### Migration
- `branch_pricing_import_snapshots` (id, branch_id, uploaded_by, filename, applied_at, reverted_at, row_count, snapshot jsonb) with GRANTs + RLS scoped via `user_can_manage_branch(branch_id)`.

### Out of scope for v1
- Tenant-level and platform-level export/import (same engine will slot in later behind a scope prop).
- Adding new SKUs via spreadsheet.
- CSV format (Excel only — matches the "make it look pretty" ask).

## Why this is worth doing
Turns the scariest screen in the branch onboarding into a familiar Excel round-trip. Owner sees every price they'll ever charge on one page, edits in bulk, and can undo a bad paste in one click — which is exactly the "yay → selling in a few hours" path you're aiming for.
