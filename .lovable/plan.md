## Goal
Force the Ring Binder Cover Sheet to be **Simplex only** — no duplex option.

## Why
A ring binder cover sheet is a single physical sheet slipped into the front pocket of the binder. Duplex printing makes no physical sense (the back faces into the binder mechanism and isn't visible).

## Changes

### 1. `src/components/order/SectionList.tsx`
Extend the existing `lockDuplex` logic so any `front_cover` section under the `ring_binders` family is treated as locked-simplex, regardless of page count.

```ts
const isRingBinderCover =
  (familySlug === "ring_binders" || familySlug === "ring-binders") &&
  section.section_type === "front_cover";
const lockDuplex = isSinglePageCover || isRingBinderCover;
```

The existing locked-toggle UI (greyed out, tooltip/note already shown) will apply automatically. Update the small helper note beneath the toggle to read "Cover sheets print single-sided only" when `isRingBinderCover` triggers the lock (so the reason is clear vs. the 1-page cover case).

### 2. `src/pages/dashboard/OrderFiles.tsx` (~line 1578)
When adding a `front_cover` section for ring binders, always set `is_duplex = false`, overriding the 2+ pages heuristic:

```ts
if (type === "front_cover" || type === "back_cover") {
  const coverDoc = documents.find((d) => d.id === selectedDocId);
  const coverPages = coverDoc?.page_count ?? 1;
  const isRingBinderCover =
    (familySlug === "ring_binders" || familySlug === "ring-binders") &&
    type === "front_cover";
  extraFields.is_duplex = isRingBinderCover ? false : coverPages >= 2;
}
```

## Out of scope
- Other ring-binder sections (Body Pages keeps its Simplex/Duplex toggle).
- Other product families.
- Pricing engine (already reads `is_duplex` per section, so the locked value flows through automatically).
- Migration of any existing in-flight carts (new behavior applies on next section add / toggle attempt).

## Verification
1. Ring Binders → upload single-page PDF → add as Cover Sheet → Duplex toggle is locked to Simplex with explanatory note.
2. Upload a 2-page PDF → add as Cover Sheet → still locked to Simplex (overrides the old "2+ pages = duplex" default).
3. Body Pages section still toggles freely.
4. Brochures/Flyers cover behaviour unchanged.
