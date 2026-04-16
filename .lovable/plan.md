

## Plan: Regenerate Ring Binders Product Image

### What
Regenerate `src/assets/products/ring-binders.jpg` using the AI image editor with one of the uploaded reference images (e.g., `ring_binder_1.webp` or `ring_binder_3.jpg`) as a base. These show exactly the style needed: a white "insert cover" ring binder with a colorful printed page visible through the clear front pocket, plain white back, rings hidden inside the spine.

### Steps
1. Copy a reference image (`ring_binder_3.jpg` — best angle, shows colorful insert) to `/tmp/`
2. Use `--edit-image` to generate a clean studio product shot: white ring binder, colorful corporate design visible through the clear front pocket, plain white spine and back, clean white background, soft shadow
3. Replace `src/assets/products/ring-binders.jpg` with the result

### Files Changed
| File | Change |
|------|--------|
| `src/assets/products/ring-binders.jpg` | Regenerated — insert-cover binder with colorful front |

