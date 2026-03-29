

# Restore Drop Shadow + Fix Scoped Print-to-Edge

## Two issues to fix

### 1. Drop shadow lost during cleanup
The outer wrapper in `FlipBook.tsx` no longer has a drop shadow on the book. Need to add a subtle `boxShadow` on the sized wrapper (the one that holds the viewport + spine), applied to the page area only — not on individual pages or on the viewport clip div.

### 2. "Print to Edge" scope is ignored
The seed data has `scope` metadata on Print to Edge options: `"all"`, `"front_cover"`, `"covers"`. But `OrderBuild.tsx` only reads `bleed: true/false` — it ignores `scope`. And `PreviewEffects.bleed` is a single boolean, so `PageEffects` can't know which pages should be edge-to-edge.

**Current flow:**
- User selects "Front Cover Only" → metadata: `{ bleed: true, scope: "front_cover" }`
- `OrderBuild.tsx` sets `fx.bleed = true` (scope lost)
- `PageEffects` removes the white margin from ALL pages

**Required flow:**
- `PreviewEffects.bleed` becomes a scope string instead of boolean
- `PageEffects` checks the scope against the current page role

## Changes

### File: `src/components/preview/previewTypes.ts`
- Change `bleed: boolean` to `bleed: "none" | "all" | "front_cover" | "covers"`
- Update `DEFAULT_PREVIEW_EFFECTS` to `bleed: "none"`

### File: `src/pages/dashboard/OrderBuild.tsx`
- Read both `bleed` and `scope` from the Print to Edge metadata
- Set `fx.bleed` to the scope string (`"all"`, `"front_cover"`, `"covers"`) or `"none"`

### File: `src/components/preview/PageEffects.tsx`
- Update bleed logic: determine `showBleedMargin` based on the scope and the current page role:
  - `"none"` → always show margin (except card covers)
  - `"all"` → never show margin
  - `"front_cover"` → no margin only on `front_cover` pages
  - `"covers"` → no margin on `front_cover` and `back_cover_card` pages

### File: `src/components/preview/FlipBook.tsx`
- Add a subtle `boxShadow` on the sized wrapper div (the one with `width: viewportWidth`) to restore the book's drop shadow:
  `boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.1)"`

## Technical detail

The bleed type change from `boolean` to a union string is the key structural fix. It flows through cleanly because only three files read the field: `OrderBuild.tsx` (writes it), `PageEffects.tsx` (reads it), and `previewTypes.ts` (defines it).

## Expected result
- Book has a visible drop shadow again
- "Print to Edge: None" → white margins on all pages
- "Print to Edge: Front Cover Only" → edge-to-edge on front cover only, margins on body pages
- "Print to Edge: Covers Only" → edge-to-edge on front + back covers
- "Print to Edge: Entire Document" → edge-to-edge everywhere
- Back cover cards remain edge-to-edge regardless (they're physical card, not printed)

