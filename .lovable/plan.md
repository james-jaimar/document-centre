## Problem

Business Cards lamination doesn't add anything to the price. Pack 1000 + Matt Lamination both sides stays at R410.

The catalogue rows exist (`matt-lam-ds` = R4.00 / SRA3, `matt-lam-ss` = R2.00, etc.), but `calculatePrice.ts` can't find them.

## Root cause

`useRateCardFinishing` (src/hooks/useRateCard.ts, ~line 301) **rewrites** each row before handing it to the pricing engine:

- `code` becomes `${item.code}-${size_code}` → real value is `matt-lam-ds-sra3`, not `matt-lam-ds`.
- `size` becomes the *label* from `catalog_sizes` (e.g. `"SRA3"`).

The business-cards branch of `calculatePrice.ts` (line ~467) looks up:

```ts
r.code === "matt-lam-ds" && (r.size ?? "").toUpperCase() === "SRA3"
```

The code check fails on every row, so `lamRow` is `null` and `lamTotal` stays 0.

## Fix

Single change in **`src/lib/calculatePrice.ts`**, business-cards lamination lookup:

- Match against the size-suffixed code emitted by the rate-card adapter: look for `r.code === \`${lamCode}-sra3\`` (case-insensitive), keeping the existing size-label sanity check as a fallback (`r.size` upper-cased equals `"SRA3"`).
- Behaviour for everything else is unchanged.

No DB migration, no UI changes, no other call-sites touched. Other families don't use this lookup.

## Verification

1. Pack 1000, Matt Lamination both sides → R410 base + (⌈1000/21⌉ = 48 sheets × R4.00) = **R602**, breakdown shows both lines.
2. Pack 1000, Gloss Lamination both sides → same maths, gloss label.
3. Pack 1000, Matt Lamination 1 side → 48 × R2.00 = +R96 → **R506**.
4. Pack 1000, No Lamination → unchanged at R410.
5. Pack 250 + Matt both sides → ⌈250/21⌉ = 12 sheets × R4 = +R48.
