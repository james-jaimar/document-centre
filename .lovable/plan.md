

# Plan: Accept Image Uploads and Convert to PDF

## Problem

The file uploader only accepts `application/pdf`. Image files (JPEG, PNG, WEBP, TIFF) are rejected at both the `<input accept>` attribute and the drag-and-drop filter. There's no image-to-PDF conversion in the codebase.

## Solution

### 1. Update FileUploader to accept images

**`src/components/order/FileUploader.tsx`**:
- Change `accept` to `"application/pdf,image/jpeg,image/png,image/webp,image/tiff"`
- Update drag-and-drop filter to allow both PDF and image MIME types
- Update label text: "Drop PDF or image files here"

### 2. Create image-to-PDF conversion utility

**New file: `src/lib/imageToPage.ts`**:
- Uses the `jspdf` library (lightweight, already browser-compatible)
- Function `imageFileToPdf(file: File): Promise<File>` that:
  1. Reads the image as a data URL
  2. Gets natural dimensions
  3. Creates a PDF page sized to match the image aspect ratio
  4. Embeds the image full-bleed on the page
  5. Returns a new `File` object with `.pdf` extension and `application/pdf` MIME type
- Handles JPEG, PNG, WEBP (TIFF converted to PNG via canvas first)

### 3. Add conversion step before upload

**`src/hooks/useDocumentUpload.ts`**:
- Import `imageFileToPdf`
- In `uploadFile`, before uploading to storage: if `file.type` starts with `"image/"`, convert to PDF first
- Update progress status text to "Converting image to PDF…" during conversion
- The rest of the pipeline (storage upload, asset registration, thumbnailing) proceeds unchanged since it receives a PDF

### 4. Install jspdf

- Add `jspdf` dependency

## Files

| File | Action |
|------|--------|
| `src/components/order/FileUploader.tsx` | Modify — accept images, update labels |
| `src/lib/imageToPage.ts` | New — image-to-PDF conversion |
| `src/hooks/useDocumentUpload.ts` | Modify — convert images before upload |

## Implementation Order
1. Install jspdf, create `imageToPage.ts`
2. Update FileUploader accept types and labels
3. Add conversion step in useDocumentUpload

