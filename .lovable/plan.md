

## Generate Business Cards product image

### What
The Business Cards product family currently shows the generic document icon placeholder (visible in the user's screenshot) because no rendered image is wired into the product card. The other 7 product families have proper rendered images. I'll generate a matching image and wire it up.

### How

**1. Generate the image**
Use Nano banana pro (`google/gemini-3-pro-image-preview`) via the Lovable AI Gateway to render a premium product shot consistent with the other 7 product family images (clean studio look, soft shadow, neutral/light background, slight angle).

Prompt direction: a small stack of premium 90×50mm business cards on a clean light surface, top card showing a subtle minimal design, soft shadow, shallow depth of field, professional product photography, square framing, no text/logos legible, neutral palette that fits the existing catalogue.

Save to: `src/assets/product-business-cards.jpg`
(File path already referenced from the previous Business Cards setup — overwriting the existing placeholder/missing asset.)

**2. Wire it into the product card**
Locate the product catalogue rendering (the grid shown in the screenshot — `AdminProducts` / customer storefront `NewOrder` / shared product card component) and confirm where product images are mapped by slug. Add the `business-cards` slug → imported `product-business-cards.jpg` mapping alongside the other 7 entries.

### Files changed

| File | Change |
|------|--------|
| `src/assets/product-business-cards.jpg` | Regenerate with Nano banana pro at higher quality |
| Product image map (whichever file holds the slug→asset map for the other 7) | Add `business-cards` entry |

### Result
The Business Cards tile in `/admin/products` and the customer storefront shows a polished product photograph matching the visual quality of the other 7 families, replacing the generic document icon.

