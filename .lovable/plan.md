

# Fix Simplex Blank Pages + Stabilize Bleed Rendering

## Two issues

### 1. Simplex sections don't insert blank backs
The page sequence builder in `PreviewPanel.tsx` (lines 74-104) iterates through each section's pages and adds them sequentially, but never checks `section.is_duplex`. When a section is simplex (single-sided), the back of each physical sheet is blank — this blank page must be inserted into the sequence so the preview accurately represents the physical document.

**Example with the user's document:**
- Front cover: 1 page, simplex → page 1 = cover artwork, page 2 = blank back
- Body: 24 pages, duplex → pages 3-26 = printed both sides, no blanks needed

Currently the sequence is just [cover, body×24] = 25 pages. It should be [cover, blank, body×24] = 26 pages.

**Fix**: In the `pages` useMemo, after adding each page from a simplex section, push a blank `PageInfo` with role `"blank_back"`. Skip this for duplex sections. This also fixes the page count display automatically.

### 2. Bleed/border inconsistency on option changes
The `bookKey` in `FlipBook.tsx` already includes `resolvedEffects`, which should force a clean remount. However, the `useMemo` dependency array for `finalPages` in `PreviewPanel.tsx` (line 193) only includes `effects?.backCover` and `effects?.frontCover` — it does NOT include `effects?.bleed`, `effects?.paperColor`, `effects?.coverLamination`, or `effects?.holePunch`. This means the `finalPages` array (and its derived `pageRoles`, `colorFlags`, `sectionTypes`) can go stale when those options change, even though the FlipBook remounts with the new effects. The FlipBook gets new effects but the same old page data.

**Fix**: Change the dependency to the full `effects` object so any option change rebuilds the page sequence and its derived arrays.

## Changes

### File: `src/components/order/PreviewPanel.tsx`

**A) Insert blank backs for simplex sections**

In the `pages` useMemo (lines 74-104), after pushing each page from a section, check `section.is_duplex`. If false, push a blank page:
```typescript
result.push({
  thumbnailUrl: "",
  pageIndex: -1,
  documentName: "",
  section,
  isColor: section.is_color,
});
```

This blank page inherits the section reference so it shows correct colour/duplex status. The role will be `"body"` (default), and it renders as an empty page with the paper background.

**B) Fix stale dependency**

Change line 193 from:
```typescript
}, [pages, effects?.backCover, effects?.frontCover, isBound]);
```
to:
```typescript
}, [pages, effects, isBound]);
```

This ensures any effects change (bleed, paper, lamination, hole punch) triggers a full rebuild of `finalPages`, `pageRoles`, `colorFlags`, `sectionTypes`, and the downstream `bookKey` in FlipBook.

## Files to edit
- `src/components/order/PreviewPanel.tsx`

## Expected result
- Simplex front cover (1 page) shows page 1 as artwork, page 2 as blank back
- Duplex body pages flow continuously with no inserted blanks
- Total page count reflects physical pages including blanks
- Changing bleed/paper/lamination options no longer causes stale border rendering

