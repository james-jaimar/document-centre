# Delivery mechanism overhaul

Three issues, three fixes. Cause of the "Outlying & Remote" misclassification for Kloof (3624) is a bug in the zone resolver — postcode 3624 IS in the platform database mapped to **Major Centre**, but the tenant's fallback zone hijacks the lookup before the platform postcode index is even consulted.

## 1. Fix the zone resolver (the real bug)

Current `resolve_delivery_zone` iterates `branch → tenant → platform` and inside each scope tries postcode → city → province → **fallback**. That means PostNet's tenant-scoped "Outlying & Remote" fallback zone matches before the platform postcode table is queried. Every address falls into Outlying regardless of postcode.

Rewrite the function to run in two passes:

- **Pass 1 — specific match**: across all scopes (branch, tenant, platform), find the most specific location hit in this priority order: postcode_prefix (longest prefix wins) → city → province. Branch beats tenant beats platform only when both have a specific hit.
- **Pass 2 — fallback**: only if no specific match anywhere, walk scopes branch → tenant → platform looking for `is_default_fallback = true`.

This makes the 3,266 platform postcodes actually drive zoning, while tenant/branch overrides still take precedence when they specifically cover a postcode/city/province.

## 2. Province selector

Replace the freeform Province text input on `src/pages/dashboard/Checkout.tsx` with a `Select` populated from the nine ZA provinces (Eastern Cape, Free State, Gauteng, KwaZulu-Natal, Limpopo, Mpumalanga, Northern Cape, North West, Western Cape). Store the canonical name in `address.province`. Default to empty; required when "Delivery" is chosen.

## 3. Minimum billable 1 kg

In `src/lib/delivery/quoteShipping.ts`, clamp `billableKg` to a floor of `1.0` before calling `quote_delivery_rate`. Keep raw `physicalKg` / `volumetricKg` in the result for display, but expose the clamped value as what gets priced. UI line in Checkout that shows "Billable weight: 0.09kg" will then read "Billable weight: 1.00kg (1 kg minimum)".

## Technical notes

- **Migration**: replace `resolve_delivery_zone` with the two-pass version. Same signature, no schema change, no RLS/GRANT changes (function already `SECURITY DEFINER`).
- **No data changes** — the existing 3,266 postcode rows and the PostNet rate tables already in place are correct. They just weren't being reached.
- **Verification after migration**: re-quote Kloof / 3624 → must resolve to platform `major_centre`, not tenant `outlying`. Quote a 0.09 kg parcel → must price the 0–1 kg tier.
- **Out of scope**: no UI changes to the admin delivery editor, no changes to rate tables, no changes to the postcode ingest function.
