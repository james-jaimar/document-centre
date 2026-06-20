## What I found

There are two independent disconnects, both root-caused:

### 1. R 0,00 on A0/A1/A2 — master rows aren't reaching the tenant/branch

You added the A0/A1/A2 click charges on **Master Pricing**. The data is there:

```
scope_type=master, tenant_id=NULL, branch_id=NULL
A0 colour simplex R160 | A1 colour simplex R80 | A2 colour simplex R40
```

But the storefront pricing engine fetches click rows via `useRateCardClicks({ scope: "branch", tenantId, branchId })`, which does:

```sql
scope_type = 'branch' AND branch_id = <demo branch> AND tenant_id = <demo tenant>
```

Master rows (`scope_type='master'`) are filtered out. The Demo branch's rate card only contains A3 mono — copied via the old "Initialise from master" seed before A0/A1/A2 existed. So `resolveClickRate("A1","colour","simplex")` returns `null`, the click line is skipped, and the total is R0.

The platform was designed around manual "Pull missing from master" / "Re-sync from tenant" buttons. That's fragile: every time a platform admin adds a master rate, every tenant + every branch has to be re-synced or new sizes silently price at R0.

### 2. Print Colour shows "Not selected"

`src/pages/dashboard/OrderBuild.tsx` line 323 blacklists `Print Colour` and `Print Sides` from default seeding for **every** family. That's only correct for multi-section bound families (where each section owns its own colour/sides). For single-section products (posters, flyers, brochures, booklets, business cards, loose sheets) the default must seed and the dropdown's value must drive the body section's `is_color` / `is_duplex` — otherwise the pricing engine reads stale section flags.

Currently it happens to "work" only because the body section was created with `is_color=true` (the default in `useOrderBuilder.ts`). Once the user picks "Black & White" nothing updates the section row, so the click row resolves to the wrong colour or stays unchanged.

## Plan

### A. Auto-cascade master → tenant → branch at query time (root fix for #1)

Update the five rate-card hooks in `src/hooks/useRateCard.ts` (`useRateCardClicks`, `useRateCardPapers`, `useRateCardFinishing`, `useRateCardPhotoPrints`, `useRateCardBusinessCards`) so a branch/tenant query returns the **merged** view:

```text
For scope=branch:
  rows = master ∪ tenant(tenantId) ∪ branch(branchId)
  Dedupe by natural key (clicks: size+colour+sides; papers: code; finishing: code+variant+size; etc.)
  Most-specific wins (branch > tenant > master); inactive rows at a more specific scope hide the fallback.

For scope=tenant:
  rows = master ∪ tenant(tenantId), same dedupe rules.

For scope=master:
  unchanged — only master rows.
```

The `RateCardEditor` (admin UI) keeps using the existing single-scope hooks — those stay separate so the editor still shows only the rows the admin owns. Add a thin `useResolvedRateCardClicks` (and friends) for the **pricing** path; switch `OrderBuild.tsx` to call those.

Net effect: any new master row is immediately live for every tenant/branch unless overridden, and the existing "Pull missing from master" button becomes optional (just freezes a snapshot).

### B. Print Colour: seed default + drive the body section (root fix for #2)

In `src/pages/dashboard/OrderBuild.tsx`:

1. Replace the hard-coded `SECTION_CONTROLLED_OPTIONS` blacklist with a family-aware check using the existing `MULTI_SECTION_FAMILIES` set (move that set into a shared `src/lib/orders/multiSectionFamilies.ts`). For single-section families, seed `Print Colour` / `Print Sides` defaults the same way as every other catalogue option.

2. Add a small effect: when `Print Colour` / `Print Sides` in `spec.selected_options` change on a single-section family, mirror the value onto every printable section row via `updateSectionMut` (mapping `colour`→`is_color=true`/`mono`→`false`; `duplex`→`is_duplex=true`/`simplex`→`false`). This keeps the pricing engine's section-level inputs in sync with the customer's choice.

### C. Verify

1. Reload `/t/demo/demo/orders/.../build` for the existing A1 poster → expect R 80,00 with breakdown `Print A1 colour simplex ×1` + paper line.
2. Toggle Document Size A0/A1/A2 → expect R 160 / R 80 / R 40 click line.
3. Toggle Print Colour to Black & White → expect either a new mono price line if a mono row exists, or the line to disappear cleanly (no stale colour pricing).
4. Confirm `RateCardEditor` (Platform → Master Pricing, and Tenant → Rate Card) still shows only the rows it owns — the merge logic is only on the pricing-path hook.
5. Re-quote an A3 mono job to confirm no regression on the existing path.

### Out of scope

- No schema migrations. Rows stay where they are; only the read path merges them.
- No changes to `calculatePrice.ts` logic — only its input list of rows changes.
- The "Pull missing from master" / "Re-sync from tenant" buttons stay as-is for admins who want a frozen tenant-owned copy.