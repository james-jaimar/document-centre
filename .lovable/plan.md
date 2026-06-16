# Presentations / Cross-Product Bug Cleanup

Three distinct bugs are causing what you're seeing. Each needs a different fix.

---

## Bug 1 — Master Catalogue still has all the legacy physical binding sizes

The admin "Edit Option → Binding" modal shows 31 catalog values (Comb 6/10/16/19/25/32/38/51mm, Spiral 6/10/12/16/20/25/32mm, Twin Loop Wire 6/8/12/16/22mm, Ring Binder 25/40/50/65/75mm) **plus** the simplified entries you actually want (Comb Black, Spiral Black/White/Clear, Twin Loop Wire Black/Silver, etc.).

That list is **`catalog_finishing` at master scope**, so every product that pulls `binding` from the master catalogue (Bound Documents, Presentations, Ring Binders, anything else) sees the same bloated list. The earlier "cleanup" only wiped the per-product saved `values` array — it never removed the legacy rows from master, so they reappear via the live projection.

**Fix:** set `is_active = false` on the 31 legacy size-specific binding rows in `catalog_finishing` (master scope). Keep:

- `comb-black`, `spiral-black`, `spiral-white`, `spiral-clear`, `wire-black`, `wire-silver`
- the generic `ring-binder-*` rows you want to keep for the Ring Binders family (please confirm — see question below)

The admin modal stays in place so you can re-enable any row later. No code changes for this bug.

---

## Bug 2 — Tab Dividers / Inserts / Finishing default to the first master row

Presentations has `Tab Dividers`, `Inserts`, `Cover Lamination`, and `Finishing` as `catalog.finishing` option rows. Saved `values` are `[]` (correctly wiped), so `useCatalogBackedOptions` seeds them live from master. Since each row is marked **Required**, the picker has no "None" entry and the first master row wins as default — hence:

- Cover Lamination → "Gloss Lamination 1 side"
- Tab Dividers → "Tab Pack (10) — White"
- Inserts → "Blank Slip Sheet 80gsm White"
- Finishing → "Business Card Trim"

The customer ends up paying for a Tab Pack and a Slip Sheet they never asked for.

**Fix (two parts):**

1. **Data:** insert "None" rows in `catalog_finishing` (master) for `cover_lamination`/`lamination`, `tab_dividers`, `inserts`, and `trimming` categories — `is_default = true`, `price` = 0, no impact. Also clear `Required = true` on the Presentations option rows for these four (they're genuinely optional add-ons, not required choices).
2. **Code (`useCatalogBackedOptions.ts` → `finishingRowsToValues`)**: when seeding a finishing option from master, if no row is marked default, fall back to the "None" / "no-…" row when one exists, instead of the first row by sort order. Belt-and-braces guard so a future category without an explicit "None" doesn't silently start charging customers.

---

## Bug 3 — Document Size shows A3 default instead of the size detected from the uploaded PDF

The Presentations configurator is showing the first entry in the Document Size list as the active size, ignoring the size that the upload pipeline already detected from the PDF. This auto-detect path is the same one that was working in Bound Documents.

Most likely cause (needs confirmation while implementing — I'll verify before changing code): the catalogue refactor swapped `Document Size` from a `manual` source to `catalog.sizes`, and `useCatalogBackedOptions`'s `preserveDefault` only matches by `slug`/`label`. The size auto-detect writes a slug like `a4-portrait` into the order config; the new master rows expose slugs like `a4`. So the detected slug no longer matches anything in the projected list and the picker falls back to the catalogue's first entry (A3 Landscape).

**Fix:**
- Confirm the detected-size slug vs. the projected master slug in `src/lib/orders/size-auto-detection` (or wherever the bound-doc auto-detect lives) and align them. Likely a slug-normalisation helper (`a4-portrait` ↔ `a4` + orientation flag) in `optionAdapter.ts`.
- If the order config already stores the detected size, make sure the configurator reads it on mount and selects the matching projected value **before** `preserveDefault` falls back to the first row.

No master-catalogue data change for this bug — purely client logic.

---

## Files likely touched

- `supabase` migration / data: deactivate 31 legacy binding rows; insert "None" rows for the four optional finishing categories; clear Required flag on the four Presentations option rows.
- `src/hooks/useCatalogBackedOptions.ts` — prefer explicit "None" row over first-by-sort when seeding optional finishing.
- `src/lib/catalog/optionAdapter.ts` — size-slug normalisation if confirmed.
- Size auto-detect entry point (to be located during implementation — same one Bound Documents uses).

---

## Out of scope

- Adding new master entries beyond the "None" rows.
- Changing pricing for any kept binding row.
- Re-snapshotting Covers / Paper Stock again (already done last round).

---

## One clarification before I implement

For the Ring Binders family, do you want **all** physical ring-binder sizes (25/40/50/65/75mm) deactivated and replaced with a single generic "Ring Binder" entry, or do you want the physical sizes kept **only** for Ring Binders and hidden for every other family? The cleanest answer is "deactivate everywhere — Ring Binders uses its own simplified entries", which is what I'll do unless you say otherwise.
