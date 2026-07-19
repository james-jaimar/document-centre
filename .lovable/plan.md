## Problem

Variant pricing (Economy / Executive for Pull-Up Banners, and any future variants) is currently editable **only at the master level** via `VariantPricingMatrix`, which is mounted inside the platform admin's Product Family → Variants tab. Branch users have no equivalent matrix — the underlying rows exist in `rate_card_clicks` (branch scope) with a `variant_code` column and are technically editable via **Branch → Pricing → Click Charges** with the variant filter, but:

- there's no per-family entry point,
- rows don't auto-appear at branch scope until the branch clicks "Pull missing from tenant",
- and there's no visual matrix showing each variant × size for the family.

## Fix

Reuse the existing `VariantPricingMatrix` component with a small scope change, then surface it on `BranchCatalogPricing.tsx` for every product family that has variant links.

### 1. Make `VariantPricingMatrix` scope-aware

Edit `src/components/admin/VariantPricingMatrix.tsx`:

- Add optional props: `scope?: "master" | "branch"` (default `"master"`), `tenantId?: string | null`, `branchId?: string | null`.
- Pass `scope`, `tenantId`, `branchId` through to `useRateCardClicks(...)`, the insert payload (`scope_type`, `tenant_id`, `branch_id`), and `TiersButton`.
- Update the header copy to reflect the scope ("Variant pricing (Branch override)" when branch).

No behavioural change at master — existing call site keeps default props.

### 2. New branch component: `BranchVariantPricingSection`

Create `src/components/pricing/BranchVariantPricingSection.tsx`:

- Load product families via `useProductFamilies()`.
- For each family, load `useProductVariantLinks(family.id)`; render the family header + `<VariantPricingMatrix scope="branch" tenantId={tenantId} branchId={branchId} productFamilyId={family.id} variantLinks={links} />` only when `links.length > 0`.
- Wrap in a collapsible card ("Variant pricing per product") so it doesn't dominate the page.

### 3. Mount on `BranchCatalogPricing.tsx`

Insert `<BranchVariantPricingSection tenantId={tenantId} branchId={branchId} />` between the Click Charges section and the Pack Pricing section, with a divider consistent with the rest of the page.

### 4. Ensure branch rows exist

Nothing new required — the "Pull missing from tenant" button already syncs `rate_card_clicks` (including variant rows). Add a short explanatory line under the new section: *"If a variant is missing, click 'Pull missing from tenant' in the Click Charges section above."*

## Out of scope

- Custom sizes not appearing in `catalog_sizes` (the existing master matrix has the same limitation and the pull-up-banner sizes are already registered as catalogue sizes, so this works today).
- Any change to `calculatePrice.ts` — variant filtering by `variant_code` already works.
- No DB migration needed; `rate_card_clicks` already supports branch-scope variant rows.
