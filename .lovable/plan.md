
# Cascade Master Catalogue → Tenant → Branch (copy-down)

## Goal
Mirror the existing rate-card cascade for the new Master Catalogue. Each level owns its own copy of catalog rows; the level above can be pulled in (additive) or fully re-synced (destructive replace).

```text
Platform (master)            ── source of truth, no tenant_id, no branch_id
        │  Pull missing  /  Re-sync
        ▼
Tenant copy                  ── editable; tenant_id set
        │  Pull missing  /  Re-sync
        ▼
Branch copy                  ── editable; branch_id set
```

## Tables to cascade
All currently global (no scope columns). Each gets `scope_type ∈ {master,tenant,branch}` + nullable `tenant_id`, `branch_id`, mirroring `rate_card_*`:

1. `catalog_sizes`
2. `catalog_print_attrs`
3. `catalog_papers`
4. `catalog_finishing`
5. `catalog_paper_prices`        (FK: paper_id, size_code)
6. `catalog_finishing_prices`    (FK: finishing_id, size_code)
7. `product_catalog_links`       (per product_family_id, catalog, sub_attribute, item_code)

`branch_catalog_overrides` stays as-is — it remains a thin per-branch enable/disable layer for any catalog item the branch chose not to clone yet.

## Migration (single file)

For each of the 7 tables:
- Add columns `scope_type catalog_scope NOT NULL DEFAULT 'master'`, `tenant_id uuid`, `branch_id uuid` (where missing).
- Backfill existing rows as `scope_type='master'`.
- Drop the old unique constraint (e.g. `code`) and re-add it scoped: `(scope_type, tenant_id, branch_id, <natural key>)`.
- For FK-bearing tables (`*_prices`, `product_catalog_links`), `paper_id`/`finishing_id`/`product_family_id` still point at the master row — children inherit the parent's master ID even when scoped; this keeps joins simple and avoids ID rewriting on clone.
- RLS:
  - master rows: readable by all, writable by platform admins (existing platform-only policy).
  - tenant rows: readable + writable by `tenant_memberships` for that tenant.
  - branch rows: readable + writable by `tenant_memberships` for that branch's tenant; further filtered by branch membership for write.
- GRANTs: `select` to anon (for storefront reads of effective catalog), full CRUD to authenticated (RLS enforces), all to service_role.

New RPC functions (SECURITY DEFINER, `search_path=public`):

- `clone_master_catalog_to_tenant(p_tenant_id uuid)` — for each of the 7 tables, insert missing rows from `scope_type='master'` into `scope_type='tenant'` for `p_tenant_id` (skip rows that already exist by natural key). Idempotent; this is the "Pull missing from master" action.
- `resync_tenant_catalog_from_master(p_tenant_id uuid)` — delete tenant-scoped rows then call clone. Destructive.
- `clone_tenant_catalog_to_branch(p_branch_id uuid)` — insert missing tenant rows (for the branch's tenant) into branch scope. If the tenant has no rows yet, fall back to master.
- `resync_branch_catalog_from_tenant(p_branch_id uuid)` — delete branch-scoped rows then call clone.

## Resolver
New helper in `src/hooks/useResolvedCatalog.ts`:
- Takes `(tenantId, branchId)` and returns the effective catalog rows per table by selecting branch rows first, then tenant rows for natural keys not in branch, then master for keys not in either.
- All product/pricing screens currently reading the global catalog (`useCatalogSizes`, `useCatalogPaperPrices`, etc.) get an optional scope arg; existing callers default to master so nothing breaks.

## UI

### Platform `/platform/master-pricing`
No new buttons (it IS the master). Already wired via `MasterCatalogPricingEditor`.

### Tenant `/admin/pricing` (and wherever catalog editing lives)
- New screen `TenantCatalogEditor` (wraps the same editor used by platform, but bound to `scope='tenant'`).
- Header buttons: **Pull missing from master**, **Re-sync from master** (with confirm).

### Branch `/branch/pricing`
- New screen `BranchCatalogEditor` (`scope='branch'`).
- Header buttons: **Pull missing from tenant**, **Re-sync from tenant** (with confirm).

Both editors reuse the existing tabs UI from `MasterCatalogPricingEditor` — extracted into a shared `<CatalogPricingEditor scope tenantId branchId />` component so the three pages are 3-line wrappers.

## Read-path migration (non-blocking, follow-up after this cascade lands)
Storefront/configurator reads switch from "master only" to the resolver, so branches actually see their own edits. This plan covers the cascade plumbing + admin UI; the read-path swap is a separate, smaller change once the data is flowing.

## Technical notes
- Following the existing `rate_card_*` precedent keeps mental model consistent.
- Natural keys per table for the new scoped unique indexes:
  - `catalog_sizes`: `code`
  - `catalog_print_attrs`: `(attribute, code)`
  - `catalog_papers`: `code`
  - `catalog_finishing`: `code`
  - `catalog_paper_prices`: `(paper_id, size_code)`
  - `catalog_finishing_prices`: `(finishing_id, size_code)` (size_code stays NOT NULL, `'any'` sentinel — matches recent normalisation)
  - `product_catalog_links`: `(product_family_id, catalog, sub_attribute, item_code)` (already normalised last migration)
- `sub_attribute` empty-string normalisation from the prior migration is preserved; the scoped unique just prefixes scope columns.
- All RPCs idempotent and safe to re-run.
- No edits to `src/integrations/supabase/types.ts` — regenerated post-migration.

## Out of scope
- Read-path resolver rollout (separate follow-up).
- Per-row "compare to parent" UI / diff view.
- Auto-sync triggers — pulls stay explicit so tenants/branches control when changes land.
