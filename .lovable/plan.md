# Posters: Image-aware Upload Routing

## Goal
When a customer is configuring a **Poster** and uploads an **image** (JPG/PNG/WEBP/TIFF/HEIC), put them through the **Photo Prints editor experience** (crop, zoom, rotate, fit/fill) instead of silently fitting the raw image to a PDF page. PDFs / Word / PowerPoint uploads on posters keep working exactly as they do today (auto-PDF, scale to chosen poster size).

## How it will work (user flow)

1. User picks **Posters** from New Order → lands on the standard Step 1 (Upload & Organise Files).
2. They upload a file. We detect the file type at drop time:
   - **PDF / DOCX / PPTX** → unchanged. Existing preflight + size auto-detection runs.
   - **Image file** (`isImageFile`) → we DON'T silently convert to PDF. Instead, we open a **Photo Editor modal** (the existing `PhotoEditorModal` already used by Photo Prints) seeded with:
     - **Print size**: the poster size the user has chosen (or the default poster size if none yet selected) — exposed as the crop aspect ratio.
     - **Border**: none (posters have no white border).
     - **Fit mode**: `fill` by default.
3. After the user crops/positions and clicks Save, we **rasterise the cropped image at the target poster dimensions** (300 DPI), wrap it in a single-page PDF at the exact poster size, upload that PDF as the document, and assign it as the poster section automatically.
4. Re-edit: the file row in the section list gets an **"Edit image"** button that re-opens the same modal (we keep the original image + crop state on the document so edits are non-destructive).
5. Changing the **Document Size** in Step 2 re-runs the crop using the saved crop state against the new aspect ratio (or prompts the user to re-crop if the new aspect differs).

## Why this is the right shape

- The Photo Prints flow already solves cropping, zoom, rotation, fit/fill, border, and signed-URL preview. We **reuse `PhotoEditorModal` and the `react-easy-crop` based UX** — no new editor.
- Posters stay in the normal print-job pipeline (one document, one section, one PDF). The cart, pricing, preview, and production output paths don't change.
- PDFs/Office files are untouched, so the existing OrderBuild + auto-rotate logic continues to work.

## Technical changes

### 1. `src/lib/imageToPage.ts`
Add a helper `imageToPosterPdf(file, { widthMm, heightMm, croppedAreaPixels, rotation })` that:
- Loads the source image.
- Applies rotation + crop (using `croppedAreaPixels` from `react-easy-crop`, same shape as Photo Prints).
- Renders to a canvas sized to the target poster mm at 300 DPI.
- Wraps in a one-page PDF at exact poster size via existing `jspdf` path used by `imageFileToPdf`.

### 2. `src/components/order/FileUploader.tsx` / `src/pages/dashboard/OrderFiles.tsx`
- Before invoking `useDocumentUpload` for poster orders (`familySlug === "posters"`), intercept `isImageFile(file)` files.
- For each such image: open `PhotoEditorModal` (a new local instance — not the Photo Prints page) with:
  - `photo` synthesized from the dropped file (object URL, no upload yet).
  - `borderSlug = "none"`.
  - `aspect` derived from the currently-selected poster size (read from `activePrintSize` in OrderFiles, or default A2 if none).
- On Save: call `imageToPosterPdf` → upload the resulting PDF through the standard `useDocumentUpload` path (so preflight, thumbnails, and section assignment keep working unchanged).
- Persist crop state on the resulting `documents.preflight_data` as `{ kind: "poster_image", source_storage_path, crop, zoom, rotation, fit_mode, croppedAreaPixels, print_size_slug }` so we can re-edit later.

### 3. Re-edit affordance
- In `SectionActions` / `FileList` row for posters where `preflight_data.kind === "poster_image"`, add an **Edit image** button that re-opens `PhotoEditorModal` with the saved state and the original image's signed URL, then re-runs steps above to replace the document.

### 4. Size-change handling in `OrderBuild.tsx`
- When the poster Document Size changes and a poster_image-backed document is present, re-rasterise the PDF using the saved crop against the new size (silent if the aspect matches; prompt "Re-crop image for new size?" toast with action if aspect changes).

### 5. No DB schema changes
- We piggy-back on the existing `documents.preflight_data` JSONB.
- No changes to product families, options, pricing rules, or order engine.

### Files to edit
- `src/lib/imageToPage.ts` — add `imageToPosterPdf` helper.
- `src/pages/dashboard/OrderFiles.tsx` — image-intercept on poster uploads, mount editor modal, re-edit button wiring.
- `src/components/order/FileUploader.tsx` — pass through the file list without auto-converting images when family is posters (or do the intercept here; OrderFiles is the cleaner spot).
- `src/components/order/FileList.tsx` (or `SectionActions.tsx`) — add "Edit image" affordance for poster_image documents.
- `src/pages/dashboard/OrderBuild.tsx` — react to size changes for poster_image documents.

### Out of scope
- Multi-image posters (we treat one image = one poster, same as today's poster flow).
- Changing the Photo Prints builder route — Photo Prints stays its own product family and dedicated page.
- Adding a white-border option for posters (can be a separate request).

## Open question (non-blocking)
- Should oversized images (e.g. 8000×6000 px) be downsampled before PDF wrapping to avoid huge uploads? Proposal: cap output PDF at 300 DPI for the chosen poster size, which naturally bounds size. Will apply unless you want a different DPI.
