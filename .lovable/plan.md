

# Fix Back Cover & Cover Display Issues

## Problems

1. **Back cover replaces last document page** — `PageEffects` checks `isLastPage` and renders the navy card color *over* the last document page (page 24). Instead, the back cover should be an **extra page appended** after all document pages.

2. **Back cover shows white bleed border** — A solid card cover (navy, black, etc.) is a physical piece of card that goes edge-to-edge. The bleed margin should not apply to it.

3. **Left-hand page showing on cover** — The `showCover={true}` prop tells react-pageflip to show page 0 solo on the right. This should already work, but if the library renders an empty left page, we may need to ensure page count is even (by padding) so the library handles cover mode correctly.

## Solution

### 1. `src/components/order/PreviewPanel.tsx` — Append back cover as extra page

After building the page list from sections/documents, if `effects.backCover !== "none"`, push one additional `PageInfo` entry with an empty thumbnail URL, a `sectionType` of `"back_cover_card"`. This makes the back cover its own page rather than overlaying the last document page.

Also ensure total page count is even by padding with a blank page if needed (react-pageflip requires even pages for proper cover mode, and an odd count causes the empty left-side issue).

### 2. `src/components/preview/PageEffects.tsx` — Use explicit page role instead of position

Stop inferring back cover from `isLastPage`. Instead, add a `pageRole` prop:
- `"back_cover_card"` — render solid color, no bleed margin
- `"front_cover"` — apply PVC overlay
- `"body"` — normal page with bleed logic

Change the component interface to accept `pageRole?: string` and use it instead of positional checks. The back cover card page gets full edge-to-edge color with no padding.

### 3. `src/components/preview/FlipBook.tsx` — Pass page role through

Thread a `pageRoles` array (parallel to `sectionTypes`) from PreviewPanel → DocumentPreview → FlipBook → FlipPage → PageEffects, so each page knows its role explicitly.

### 4. `src/components/preview/previewTypes.ts` — Add `pageRoles` prop

Add `pageRoles?: string[]` to `PreviewComponentProps` and `FlipBookProps`.

### 5. `src/components/preview/DocumentPreview.tsx` — Pass through `pageRoles`

## Files to edit

1. **`src/components/preview/previewTypes.ts`** — Add `pageRoles?: string[]` to props interfaces
2. **`src/components/order/PreviewPanel.tsx`** — Append back cover page, pad to even count, build `pageRoles` array
3. **`src/components/preview/PageEffects.tsx`** — Accept `pageRole` prop, use it for cover/bleed logic instead of position
4. **`src/components/preview/FlipBook.tsx`** — Accept and pass `pageRoles`, forward `pageRole` to `PageEffects`
5. **`src/components/preview/DocumentPreview.tsx`** — Pass `pageRoles` through

