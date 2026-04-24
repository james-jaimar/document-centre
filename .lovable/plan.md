## Problem

When a user adds the **Body Pages** before the **Front Cover** in Step 1, the preview ignores the cover and shows the first body page as page 1 (see screenshot). The same happens to the "Your Document" list on the right of Step 1.

### Why

Sections in `document_sections` are keyed by `sort_order`, which is set to `sections.length` at insert time — i.e. the *click order*, not the document role.

- `useOrderData` queries `.order("sort_order", { ascending: true })`
- `PreviewPanel.buildPageSequence` iterates `bodySections` in that same array order
- `SectionList` (Your Document panel) renders in that same array order

So a Body added first gets `sort_order = 0` and stays in front of a Front Cover added later. The cover IS in the database with the correct role, but it's appended after the body in the sequence and never injected at the front.

This affects every bound product (bound documents, ring binders, booklets, presentations, stapled/loose) and the right-hand "Your Document" list everywhere. Brochures and posters are not affected the same way because their previews look up sections by role (`sections.find(s => s.section_type === "front_cover")`), not by array order.

## Fix

Apply a **role-based ordering pass** at the read boundary so that, regardless of click order:

```text
front_cover  →  body (in user-defined sub-order)  →  back_cover  →  inserts/tabs (anchored)
```

Sub-ordering of multiple body sections (when a doc is split into chapters, etc.) keeps their relative `sort_order`.

### Implementation

1. **`src/lib/orders/sectionOrdering.ts` (new)** — small helper:
   ```ts
   const ROLE_RANK = { front_cover: 0, body: 1, back_cover: 2, insert: 3, tab: 3 };
   export function sortSectionsByRole(sections) { … stable sort by [roleRank, sort_order] … }
   ```
2. **`src/components/order/PreviewPanel.tsx`** — apply `sortSectionsByRole` once at the top of `buildPageSequence` (before splitting body vs anchored). This makes every bound preview render Front → Body → Back regardless of click order.
3. **`src/components/order/SectionList.tsx`** — apply `sortSectionsByRole` to `fileSections` so the right-hand "Your Document" panel mirrors the actual physical order.
4. **`src/pages/dashboard/OrderFiles.tsx`** — when computing `sort_order` for a newly added section, slot it after the last section of the same-or-lower role rank, so newly added covers physically renumber ahead of body. (Belt-and-braces; the read-side sort already covers display, but this keeps DB rows tidy and avoids surprises for downstream consumers like `buildJobSnapshot`.)

### Out of scope / not changed

- `buildJobSnapshot` and the order engine — they already consume sections by role, but with (4) above they'll also see a logical sort_order.
- Brochures, posters, photo prints — they look up sections by role and are unaffected by this bug. The new helper is a safe no-op for them.
- The anchored-tab/insert flush logic in `buildPageSequence` is untouched; ordering only changes which body section comes first.

## Files

- **New** `src/lib/orders/sectionOrdering.ts`
- **Edit** `src/components/order/PreviewPanel.tsx` — sort sections at the top of `buildPageSequence`
- **Edit** `src/components/order/SectionList.tsx` — sort `fileSections` before render
- **Edit** `src/pages/dashboard/OrderFiles.tsx` — compute role-aware `sort_order` in `handleAddAs` and the auto-assign helpers
