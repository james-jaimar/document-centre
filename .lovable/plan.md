Three small fixes (Phase 7 still parked for later).

## 1. Preserve uploads when switching from Stapled/Loose → Presentations

**Problem**: When the orientation advisory offers "Use Presentations instead", we currently `navigate(tenantPath("orders/new"))` and the in-progress order (with uploaded landscape files) is abandoned. Customer loses everything.

**Fix**: Convert the current order in place instead of starting a new one.

- In `OrderFiles.tsx` `handleSwitchProductFamily`:
  - Resolve the target product family slug (`presentations` when `mode === "to-portrait"`, `bound-documents` when `to-landscape`).
  - Look up the target family + a sensible default product/recipe (mirroring what `NewOrder` would have picked).
  - Update the existing `order_items` row: set the new `product_family_id`, `product_id`, refreshed `recipe_snapshot` (preserve qty, copy across sensible options like paper/colour/sides if compatible — otherwise reset to family defaults).
  - Keep all `documents` / `order_documents` rows attached to the same `order_item_id` — they already point at the same uploads, so nothing needs re-uploading.
  - Clear the orientation flag on each affected document (`preflight_data.orientation_resolved = true`, `orientation_action = "switched_family"`) so the new flow doesn't re-prompt.
  - Navigate to the same order's build/files page under the new family (`tenantPath(\`orders/${orderId}/files\`)` or the equivalent route presentations uses).
  - Toast: "Switched to Presentations — your files are still here."
- If the conversion fails (e.g. incompatible recipe), fall back to current behaviour with a clear toast.

## 2. Lock currency to the tenant (ignore geo)

**Problem**: `useRegionalPricing` runs `detect-region` (IP → country) and overrides the displayed/stored currency. A UK visitor on a ZAR-only tenant gets GBP across the order, invoice, emails.

**Fix**: Tenant-level currency lock that short-circuits geo detection.

- **Schema (migration)**: Add `default_currency_code text not null default 'ZAR'` and `lock_currency boolean not null default true` to `public.tenants` (or store as two `tenant_settings` rows under category `financial`: `default_currency_code`, `lock_currency`). Going with `tenant_settings` to match existing financial config pattern — no schema change to `tenants`.
- **Admin UI**: Add a "Default currency" select (ZAR/GBP/EUR/USD/AUD) and a "Lock to this currency (ignore visitor region)" switch to `src/pages/admin/settings/FinancialTab.tsx`. Default = ZAR, locked = true.
- **Hook**: Update `useRegionalPricing` to accept/observe the tenant's locked currency. When `lock_currency` is true, skip `detect-region`, force `region` to the tenant's currency entry, and disable the manual region switcher. When unlocked, keep current geo behaviour.
- **Currency-stamping safety net**: In `useCart` (line ~118) and `useQuotes`, when stamping `orders.currency` / `quotes.currency`, prefer the tenant's locked currency over `input.currencyCode` if the lock is on. Belt-and-braces so any forgotten caller still produces ZAR rows.
- Existing orders are not migrated — they keep whatever currency was stamped at order time (financial immutability rule).

## 3. Searchable favourite-branch picker on Customer → Settings

**Problem**: `CustomerAccount.tsx` renders favourite branch as a plain `<Select>`; with hundreds of branches it's an unusable scroll.

**Fix**: Replace the `Select` with a shadcn `Command`-based combobox inside a `Popover` (same pattern as the existing storefront `BranchPicker` search).

- Trigger: a `Button variant="outline"` showing the current favourite branch name (or "No preference"), full-width up to `max-w-sm`.
- Popover content: `Command` with `CommandInput placeholder="Search branches…"`, `CommandList`, a "No preference" item at the top, then one `CommandItem` per branch showing `name` + small `city, province` line. Filter matches name/city/province/slug.
- On select: call `fav.set.mutate(...)` and close the popover.
- No data-model change — uses the existing `useFavouriteBranch` hook and `useBranch().branches`.

## Technical notes

- Order conversion (item 1) only touches existing `order_items` / `documents` rows; no new tables. The order row itself stays the same (cart status, branch, customer).
- Currency lock (item 2) reads from `tenant_settings` via the existing `useTenantSettingsMap("financial")` hook — no new query plumbing.
- Combobox (item 3) is a pure frontend swap inside `CustomerAccount.tsx`.

Want me to proceed?
