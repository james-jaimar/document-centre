

## Plan: Generate Product Header Images

### What We're Building
Realistic 3D-rendered product images for all 8 product families, then updating the product card UI to display them instead of plain icons.

### Products (8 images)
1. **Bound Documents** — spiral/wire-bound document stack
2. **Presentations** — landscape spiral-bound presentation
3. **Ring Binders** — D-ring binder with pages
4. **Stapled & Loose Pages** — stapled document set
5. **Posters** — large format rolled/flat poster
6. **Booklets** — saddle-stitched booklet
7. **Flyers** — stack of printed flyers/leaflets
8. **Brochures / Folded Leaflets** — tri-fold brochure

### Image Generation
- Use the AI image generation model (`google/gemini-3-pro-image-preview`) for highest quality
- Each image: clean white/light gradient background, realistic 3D render of the printed product, soft shadows, studio lighting
- Save to `src/assets/products/` for Vite bundling
- Consistent style across all 8 — same lighting, perspective angle, and background treatment

### Database Change
- Add an `image_url` column to `product_families` (nullable text) via migration
- This allows tenant admins to upload custom product images later

### UI Update — `NewOrder.tsx`
- If a product family has an `image_url` or a local asset, render the image instead of the Lucide icon
- Fall back to the icon if no image exists
- Slightly larger card with the image as a hero element (similar to the reference screenshot but with richer visuals)
- Keep the existing card click behavior

### Technical Steps
1. Generate 8 images via AI image generation script → save to `src/assets/products/`
2. Migration: `ALTER TABLE product_families ADD COLUMN image_url text`
3. Update `NewOrder.tsx` to import and display product images, mapping by slug
4. Update types

### File Summary
| File | Change |
|------|--------|
| `src/assets/products/*.png` | 8 new generated images |
| Migration | Add `image_url` column |
| `src/pages/dashboard/NewOrder.tsx` | Display images instead of icons |
| `src/integrations/supabase/types.ts` | Add `image_url` field |

