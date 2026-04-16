

## Plan: Fix Brochure Image + Regenerate 3 Product Images

### Issue (d) — Brochure image not showing on dashboard
The `CustomerDashboard.tsx` maps `"brochures-folded-leaflets"` but the actual product slug is `"brochures"` (which is why `NewOrder.tsx` works — it uses the correct slug). Simple one-line fix.

### Issues (a), (b), (c) — Regenerate 3 images with better prompts

Using the AI image generation script to create improved versions:

1. **Bound Documents** — Regenerate: thinner spine (half current thickness), colorful cover design visible on front page
2. **Presentations** — Regenerate: landscape-oriented document, spiral/wire-bound on the left edge, colorful cover
3. **Ring Binders** — Regenerate: D-ring binder with a colorful printed cover/insert visible through the front pocket

All images will maintain the same consistent studio lighting and white background style.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/dashboard/CustomerDashboard.tsx` | Fix slug: `"brochures-folded-leaflets"` → `"brochures"` |
| `src/assets/products/bound-documents.jpg` | Regenerated — thinner, colorful cover |
| `src/assets/products/presentations.jpg` | Regenerated — landscape, left-bound |
| `src/assets/products/ring-binders.jpg` | Regenerated — colorful cover insert |

### Steps
1. Fix the brochure slug mismatch in `CustomerDashboard.tsx`
2. Regenerate 3 images via AI image generation with refined prompts
3. Replace existing files in `src/assets/products/`

