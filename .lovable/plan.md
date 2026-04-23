
## Fix business card preview to use exact trimmed card size and full-bleed rendering

### Problem

The PDF server is already doing the right thing: it reads the bleed, trims the artwork to the finished card size, and stores `page_width_mm` / `page_height_mm` from the resolved Trim Box. The preview is still wrong because the client is adding a synthetic white inset as if the card were a non-bleed paper page.

For business cards, the user should see the finished 90×50mm face exactly as trimmed by the server — edge to edge, with no extra white margin invented by the UI.

### Root cause

Two things are working against the preview:

1. **Business cards are falling through to generic `loose_sheets` behaviour** instead of a card-specific path.
2. **Bleed is only enabled when a “Print to Edge” option exists**, but business cards do not use that option. As a result, `PageEffects` applies the default non-bleed inset (`bleedInsetPx`), which creates the white border the user is seeing even though the thumbnail is already trim-cropped.

### Implementation

#### 1) Add a dedicated business-card preview type
Create a `business_cards` preview type so cards can have their own preview rules without affecting other loose-sheet products.

Files:
- `src/components/preview/previewTypes.ts`
- `src/pages/dashboard/OrderBuild.tsx`
- `src/lib/orders/inferPreviewType.ts`

Changes:
- Add `"business_cards"` to `ProductPreviewType`
- Map product family slug `business-cards` to `"business_cards"` in live preview inference
- Map placed-order preview inference to `"business_cards"` as well

This keeps card-specific behaviour isolated and avoids contaminating generic loose-sheet previews.

#### 2) Use the finished card dimensions as the preview canvas ratio
Make the preview ratio come from the trimmed physical size first, not from generic fallback logic.

Files:
- `src/components/order/PreviewPanel.tsx`
- `src/lib/orders/buildPreviewSnapshot.ts`

Changes:
- Continue using document `page_width_mm / page_height_mm` as the primary source, since those values already come from the server’s Trim Box crop
- Add a fallback to selected `Document Size` metadata when dimensions are missing, so business cards still render at the correct ratio:
  - Standard ZA/UK/AU card = **90 / 50 = 1.8**
  - Other card sizes continue to use their own option metadata if selected
- Persist the same ratio logic into the saved preview snapshot so placed-order previews match the live configurator

#### 3) Force edge-to-edge rendering for business cards
Because the server thumbnails are already trim-cropped, the preview must not add a fake inner margin for cards.

Files:
- `src/components/order/PreviewPanel.tsx`
- `src/lib/orders/buildPreviewSnapshot.ts`

Changes:
- In the `bleedFlags` computation, treat `business_cards` faces as bleed-enabled by default
- That means `PageEffects` gets `allowBleed=true` for business card faces and uses `inset = 0`
- Do the same in snapshot generation so customer/admin order detail previews stay identical

This is the key fix for the white border.

#### 4) Keep the card fitted inside the preview area, but on a correct 90×50 canvas
The preview box should remain responsive, but its internal artwork canvas must be the true card ratio.

File:
- `src/components/preview/LooseSheetsPreview.tsx`

Changes:
- Reuse the existing fit-to-container sizing, but ensure the page frame is driven by the resolved business-card ratio
- Keep `object-contain` for the trimmed thumbnail itself; once `allowBleed=true` and the frame ratio is correct, the image will sit edge-to-edge naturally without extra client-side cropping

### Why this fixes the screenshots

- The server already outputs a trimmed 90×50mm result
- The preview will now use a **1.8 ratio canvas**
- The preview will **stop injecting the white inset**
- The user will see the finished card face exactly edge-to-edge, matching the trimmed output shown in Acrobat

### Files to change

| File | Change |
|---|---|
| `src/components/preview/previewTypes.ts` | Add `business_cards` preview type |
| `src/pages/dashboard/OrderBuild.tsx` | Map `business-cards` family slug to `business_cards` |
| `src/lib/orders/inferPreviewType.ts` | Map placed-order inference to `business_cards` |
| `src/components/order/PreviewPanel.tsx` | Use exact trimmed ratio / size fallback and force bleed for business cards |
| `src/lib/orders/buildPreviewSnapshot.ts` | Mirror live ratio + bleed logic for saved previews |
| `src/components/preview/LooseSheetsPreview.tsx` | Ensure the preview canvas uses the resolved business-card ratio |

### Result

- A 90×50mm business card renders on a **90:50 proportioned preview canvas**
- Edge-to-edge artwork displays **flush to the card edges**
- No fake white border is added by the client
- Live preview and placed-order preview stay consistent
- Other preview types remain isolated and unchanged
