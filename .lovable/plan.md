
Fix the thumbnail pipeline in two places, because the current issue is not just styling:

1. Normalize thumbnail values before saving
- In `src/hooks/useDocumentUpload.ts`, add a small helper that converts any thumbnail reference into a bucket-relative key.
- It should handle all of these:
  - `thumbnails/page-001/file.png`
  - `/storage/v1/object/public/document-uploads/thumbnails/page-001/file.png`
  - `https://...supabase.co/storage/v1/object/public/document-uploads/thumbnails/page-001/file.png?`
- Save only `thumbnails/...png` into `thumbnail_urls`.
- This fixes new uploads and reprocessed files.

2. Make legacy thumbnail data still work
- In the UI, do not trust `thumbnail_urls` as already usable.
- Add shared thumbnail URL resolution so legacy public URLs are converted back to storage keys and then signed.
- Use that same logic everywhere thumbnails appear:
  - `src/components/order/FileList.tsx`
  - `src/components/order/SectionList.tsx`
  - `src/components/order/PreviewPanel.tsx`
- Right now only `FileList` attempts signed URLs, while `SectionList` and `PreviewPanel` still render raw values directly.

3. Remove the clipped/rounded look
- Change thumbnail frames to true rectangles with no visible rounding:
  - replace rounded classes on the thumbnail wrappers with `rounded-none` or a near-zero radius
- Also switch small thumbnail images from `object-cover` to `object-contain` where needed so the page preview is not cropped.

4. Preserve backward compatibility
- Keep support for old rows already saved with broken public URLs by normalizing them at render time.
- That way existing documents can start showing thumbnails immediately, without requiring every old file to be reprocessed.

5. Verify the result
- Confirm in the database that newly processed documents now store `thumbnail_urls` as storage keys only.
- Confirm all three UI surfaces show the same thumbnail:
  - uploaded files list
  - section list
  - preview panel
- Confirm the thumbnail frame is rectangular with no chopped corners.

Technical notes
- I checked the latest `documents` rows: the newest records still contain full public URLs in `thumbnail_urls`, which is why signing is being bypassed.
- I also checked the code: `SectionList` and `PreviewPanel` currently use `thumbnail_urls` directly, so even if `FileList` is fixed, the rest of the app can still fail.
- The rectangle issue is caused by both corner radius and image cropping, not just the wrapper size.
