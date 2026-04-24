# Document Centre API — contract notes for this client

The Lovable client at this repo talks to the FastAPI server hosted at
`https://document-centre-api.jaimar.dev` via the
`supabase/functions/pdf-api` proxy. This file records contracts that the
client depends on, especially endpoints that need to exist on the server.

The complete server API is browseable at `/openapi.json`.

## Office → PDF conversion (Word, PowerPoint, OpenDocument)

The PDF server has LibreOffice installed. The client expects a single
operation endpoint to expose it.

### Endpoint

```
POST /v1/operations/convert-office
Body: { "asset_id": "<uuid>" }
Returns: { "job_id": "<uuid>" }
```

### Accepted source MIME types

The client uploads the original Office file to S3 and registers an asset
with one of these MIME types:

| Format     | Extensions  | MIME |
|------------|-------------|------|
| Word       | .doc        | `application/msword` |
| Word       | .docx       | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| PowerPoint | .ppt        | `application/vnd.ms-powerpoint` |
| PowerPoint | .pptx       | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| OpenDocument Text          | .odt | `application/vnd.oasis.opendocument.text` |
| OpenDocument Presentation  | .odp | `application/vnd.oasis.opendocument.presentation` |
| OpenDocument Spreadsheet   | .ods | `application/vnd.oasis.opendocument.spreadsheet` |

(Mirrored in `src/lib/officeFiles.ts` — keep in sync.)

### Worker behaviour expected

1. Download the asset from `source_storage_path`.
2. Run `soffice --headless --convert-to pdf --outdir <tmp> <input>`.
3. Upload the PDF to a derived-files path on S3.
4. Register a derived file with `kind = "converted_pdf"` and
   `media_type = application/pdf`.
5. **Promote** the converted PDF to the asset:
   - `normalized_storage_path` → the new PDF's S3 key
   - Recompute `page_count`, `width_pt`, `height_pt`, `boxes` from the PDF
     (same logic as `/v1/assets/{id}/inspect`).
6. Mark the job as `completed`.

After step 6 the client calls `inspect` on the same `asset_id` and the
standard PDF pipeline (`crop-rasterize`, thumbnails, etc.) runs against
the converted PDF, transparent to downstream code.

### Error handling

If LibreOffice fails (corrupt file, unsupported macro, font missing) the
job should:
- Set `status = "failed"`.
- Populate `error` with a human-readable string. The client surfaces this
  string to the user in a toast and marks the `documents` row as
  `document_status = 'error'`.

### Why this lives here

The server lives in a separate repo. This file is the canonical contract
the client depends on so it isn't lost between repos. Any changes to the
endpoint shape or the accepted MIME list must be reflected in
`src/lib/officeFiles.ts` and `src/lib/documentCentreApi.ts` at the same
time.
