## Goal

Prevent a user from assigning a multi-page PDF as a Front Cover or Back Cover on bound products. A cover is physically one sheet (max 2 printed sides). When the user tries to add a 3+ page doc as a cover, warn and offer to use only pages 1–2.

## Scope

Bound-style families where `front_cover`/`back_cover` sections are physical sheets:
`bound-documents`, `ring-binders`, `booklets`, `stapled-loose-pages`, `perfect-bound`, `wire-bound`, `comb-bound`, `saddle-stitched`.

Excluded: `brochures` and `flyers` (covers there are panel layouts, already handled by `handleAutoAssignBrochure` / panel auto-assign). `posters` (single sheet, no body).

## Behaviour

When the user clicks "Front Cover" or "Back Cover" in the "Add Selected File As" panel (`handleAddAs` in `src/pages/dashboard/OrderFiles.tsx`):

1. If product family is in the gated set AND the selected doc's `page_count > 2`, show a confirmation modal instead of immediately calling `addSection`:
   - Title: "Covers can only use 2 pages"
   - Body: "A {Front Cover/Back Cover} is a single sheet, so only the first 2 pages of *{file}* can be printed (page 1 outside, page 2 inside). The remaining {N − 2} pages will be ignored. Continue?"
   - Buttons: **"Use first 2 pages"** (primary) · **"Cancel"**
2. On confirm, call the existing `addSection` mutation with `page_range_start: 0`, `page_range_end: 1`, and `is_duplex: true` (since 2 pages = duplex cover, matching existing cover-physics logic on lines 1578–1585).
3. On cancel, abort — section is not added.
4. For 1- or 2-page docs, behaviour is unchanged (no modal).

## UI

Reuse the existing shadcn `Dialog` pattern used by `PageCountWarningDialog.tsx`. Either:
- (a) Add a small dedicated component `CoverPageLimitDialog.tsx`, or
- (b) Use an inline `AlertDialog` directly in `OrderFiles.tsx` since it's single-purpose.

Recommend (a) for consistency with `PageCountWarningDialog`.

State added to `OrderFiles.tsx`:
```ts
const [coverLimitPrompt, setCoverLimitPrompt] = useState<{
  type: "front_cover" | "back_cover";
  docId: string;
  pageCount: number;
  fileName: string;
} | null>(null);
```

## Technical Details

### Files

- **`src/lib/pageCountRules.ts`** — add a helper:
  ```ts
  export function isCoverPageLimited(familySlug: FamilySlug): boolean
  ```
  returning `true` for the bound-style families listed above. Keeps the policy in one place alongside existing page-count rules.

- **`src/pages/dashboard/OrderFiles.tsx`** —
  - In `handleAddAs`, after the orientation + size guards, if `type` is a cover, `isCoverPageLimited(familySlug)` is true, and `coverDoc.page_count > 2`, set `coverLimitPrompt` and `return` (don't call `addSection`).
  - Extract the existing `addSection.mutateAsync({...})` block into a small inner helper `commitCoverAssignment(type, docId, { trimToFirstTwoPages })` so both the unconstrained path and the "Use first 2 pages" path share one code path. When trimming, pass `page_range_start: 0, page_range_end: 1, is_duplex: true`.
  - Render `<CoverPageLimitDialog />` near the existing `<PageCountWarningDialog />` (around line 2350).

- **`src/components/order/CoverPageLimitDialog.tsx`** (new, ~60 lines) — small wrapper around `Dialog` matching the styling of `PageCountWarningDialog`. Props: `open`, `type`, `fileName`, `pageCount`, `busy`, `onConfirm`, `onCancel`.

### Non-changes

- No schema / DB / Edge Function changes — `page_range_start` and `page_range_end` already exist on `document_sections` and are honoured by `buildJobSnapshot` and `buildPreviewSnapshot`.
- No change to the existing `PageCountWarningDialog` (that gates *whole-document* families like flyers/business cards). The new dialog is *section-level*, which is a different concern.
- Brochure auto-assign and panel auto-assign paths are unaffected.

## Out of Scope

- Server-side / DB-level enforcement. (Worth doing later as a check constraint or trigger on `document_sections`, but UI gating + range-trimming is sufficient for this fix.)
- Retroactive validation of existing cart items already saved with multi-page covers.
- Drag-and-drop or reorder flows that change a section's `section_type` (current UI doesn't allow this).
