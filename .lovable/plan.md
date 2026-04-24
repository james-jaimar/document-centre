## Office → PDF conversion via LibreOffice

### Current state

- The PDF server (`document-centre-api.jaimar.dev`) has LibreOffice installed but **does not yet expose an HTTP endpoint** for conversion. Confirmed by inspecting `/openapi.json` — the only operations are `rotate, grayscale, cmyk, resize, nup, impose-sheet, booklet, merge, crop-rasterize`.
- The Lovable client only accepts `application/pdf` and images. `FileUploader.tsx` filters Office files out, and `useDocumentUpload.ts` only auto-converts images (via `imageFileToPdf`).
- Result: dropping a `.docx`/`.pptx`/`.odt` does nothing — the file is silently rejected.

So this is a two-sided fix: a small server-side endpoint, and a client pipeline that uses it.

---

### Part A — Server endpoint (spec; you implement on the PDF server)

Add one new operation that takes an already-uploaded Office asset and produces a normalized PDF derived file using LibreOffice headless.

```text
POST /v1/operations/convert-office
body: { "asset_id": "<uuid>" }
returns: { "job_id": "<uuid>" }
```

Worker behaviour:
1. Download `source_storage_path` from S3.
2. Run `soffice --headless --convert-to pdf --outdir <tmp> <input>`.
3. Upload PDF to a derived-files path, register a derived file of `kind = "converted_pdf"`, `media_type = application/pdf`.
4. **Promote** that PDF to the asset: set `normalized_storage_path` to the new PDF and recompute `page_count`, `width_pt`, `height_pt`, `boxes` (same logic as `inspect`).
5. Mark job `completed`.

Accepted input MIME types (mapped from extension if browser sends `application/octet-stream`):
- Word: `.doc`, `.docx` → `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- PowerPoint: `.ppt`, `.pptx` → `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- OpenDocument: `.odt`, `.odp`, `.ods` → `application/vnd.oasis.opendocument.{text,presentation,spreadsheet}`

(I'll commit a stub doc in this repo recording the contract, since the server lives in another repo.)

---

### Part B — Client wiring (this repo)

#### 1. `src/lib/officeFiles.ts` (new)

Single source of truth for Office detection.

- `OFFICE_EXTENSIONS = ['doc','docx','ppt','pptx','odt','odp','ods']`
- `OFFICE_MIME_TYPES = { ... }` (the 8 MIME types above)
- `isOfficeFile(file: File): boolean` — checks MIME first, falls back to extension (browsers often send `application/octet-stream` for `.odt`).
- `officeMimeFromFilename(name: string): string` — used when the browser-supplied `file.type` is empty/unknown, so we send a real MIME to the server.

#### 2. `src/lib/documentCentreApi.ts`

Add the new operation wrapper:

```ts
export async function convertOffice(assetId: string): Promise<{ job_id: string }> {
  return request("v1/operations/convert-office", "POST", { asset_id: assetId });
}
```

#### 3. `supabase/functions/pdf-api/index.ts`

`v1/operations/convert-office` already matches the existing `v1/operations` allowlist prefix, so **no proxy change is required**. Verified against `ALLOWED_PREFIXES`.

#### 4. `src/components/order/FileUploader.tsx`

- Extend the file-input `accept` attribute and the drag-drop filter to include the 8 Office MIME types and the extension fallbacks.
- Update the helper text from "Drop PDF or image files here" to "Drop PDF, Word, PowerPoint, or image files here" (keeping it short).

#### 5. `src/hooks/useDocumentUpload.ts` — the conversion step

Insert an Office-handling branch into `uploadFile`, BEFORE the existing image branch:

```text
1. If isOfficeFile(file):
     a. updateUpload: "Uploading Office document…" (5%)
     b. Upload the original file to S3 (same path scheme, just keep extension).
     c. Insert documents row with mime_type = real Office MIME, document_status = 'processing'.
     d. updateUpload: "Converting to PDF…" (15%)
     e. createAsset({ original_filename, media_type: officeMime, source_storage_path, auto_queue: false })
     f. convertOffice(asset_id)  → poll job (uses existing pollJob).
        - On 'pending' → "Queued — waiting for converter…" (20%)
        - On 'running' → "Converting with LibreOffice…" (35%)
        - On 'failed'  → mark documents row as 'error', surface job.error, abort.
     g. After completion the asset's normalized_storage_path is now a PDF; continue with the existing inspect → render pipeline using that asset_id (skip a second createAsset).
2. Else if isImageFile(file): existing path.
3. Else (PDF): existing path.
```

To make step (g) clean, refactor the current flow slightly: extract `inspectDocument`'s "create asset + inspect" into two pieces, so the Office branch can reuse the inspect+render half against the already-existing asset_id. Concretely:

- Add an internal `inspectExistingAsset(docId, assetId, fileName)` that runs the current `inspectAsset` + advisory logic without re-creating the asset.
- The PDF branch keeps calling today's `inspectDocument(docId, storagePath, fileName)` (which calls `createAsset` then `inspectExistingAsset` internally).
- The Office branch calls `createAsset` itself, then `convertOffice` + `pollJob`, then `inspectExistingAsset(docId, assetId, fileName)`.

#### 6. UX — file size & pre-flight

- Keep the existing 50 MB limit for now (matches `mem://constraints/upload-size-limit`).
- When the converter fails (e.g. corrupt `.docx`), surface the job's `error` string in the toast and mark the document row `error` so the file row in `FileList` shows the existing error chip — no new UI needed.

---

### Files

**Modify**
- `src/components/order/FileUploader.tsx` — accept Office types
- `src/hooks/useDocumentUpload.ts` — Office branch + small refactor of inspect helper
- `src/lib/documentCentreApi.ts` — `convertOffice()` wrapper

**Create**
- `src/lib/officeFiles.ts` — detection + MIME mapping
- `docs/document-centre-api-contract.md` — record the `/v1/operations/convert-office` spec for the server team (so it isn't lost)

**No changes needed**
- `supabase/functions/pdf-api/index.ts` — the `v1/operations/...` path is already allowed.
- DB migrations — `documents` table already has `mime_type` and `document_status`.

---

### Out of scope (called out so it isn't a surprise)

- Implementing the actual `/v1/operations/convert-office` endpoint on the PDF server — that lives in your separate FastAPI repo. The client work above is harmless until that endpoint exists; once deployed, drag-and-drop of `.docx`/`.pptx`/`.odt` will Just Work.
- Server-side font embedding / Office-feature compatibility tuning — a vanilla LibreOffice headless conversion is good enough for the print pipeline; we treat the converted PDF as the source of truth from that point on.

Approve and I'll switch to build mode to implement Part B (client + edge proxy verification + spec doc).