

## Plan: Regenerate Presentations Image Using References

### Problem
The AI image generator produced a portrait-oriented or incorrectly bound image for "Presentations." The reference images clearly show: **landscape (wider than tall) A4 documents with wire/spiral binding along the left short edge**.

### Approach
Use the uploaded reference images as direct input to the AI image editor. Take one of the best references (e.g., `landscape_4.jpg` or `landscape_5.jpg`) and use `--edit-image` mode to generate a clean product shot in the same studio style as the other product images — white/light background, realistic 3D render, colorful corporate cover design, wire binding on the left short edge.

### Steps
1. Copy a reference image to `/tmp/`
2. Use the AI image generation with `--edit-image` to create a studio-style product shot based on the reference — landscape A4, wire-bound on left short edge, colorful cover, white background
3. Replace `src/assets/products/presentations.jpg` with the result

### Files Changed
| File | Change |
|------|--------|
| `src/assets/products/presentations.jpg` | Regenerated using reference images |

