# Lovable frontend flow

This is the practical frontend flow for upload, process, preview, and impose.

## 1. User selects a file
From your Lovable frontend, let the user choose:
- PDF
- JPG / PNG / TIFF
- DOCX / PPTX / XLSX

## 2. Upload the raw file to Supabase Storage
Upload the original file first.
Example storage key:
- `uploads/{userId}/{uuid}-{filename}`

Keep:
- original filename
- mime type
- storage path

## 3. Tell PrintForge about the uploaded file
Call:

`POST /v1/assets`

Body:
```json
{
  "original_filename": "brochure.docx",
  "media_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "source_storage_path": "uploads/user-123/abc-brochure.docx",
  "metadata": {
    "order_id": "order_001",
    "kind": "text"
  }
}
```

Response:
```json
{
  "asset_id": "uuid",
  "job_ids": ["normalize-job-uuid"]
}
```

## 4. Poll the job until complete
Call:

`GET /v1/jobs/{job_id}`

When status becomes `completed`, fetch:

`GET /v1/assets/{asset_id}`

This gives you:
- normalized PDF path
- thumbnail path
- preview path
- page count
- width and height
- boxes

## 5. Show preview in Lovable
If you are using Supabase storage public URLs in your app, convert the returned storage path to a public URL.
For local mode during testing, use:
- `/local/{storage_path}`

Use:
- thumbnail for cards/list rows
- preview for document detail page
- page count and boxes for print checks

## 6. Create processing jobs from UI buttons

### Rotate
`POST /v1/operations/rotate`
```json
{
  "asset_id": "uuid",
  "options": { "angle": 90 }
}
```

### Grayscale
`POST /v1/operations/grayscale`
```json
{
  "asset_id": "uuid",
  "options": {}
}
```

### CMYK
`POST /v1/operations/cmyk`
```json
{
  "asset_id": "uuid",
  "options": { "icc_profile": "/app/icc/ISOcoated_v2_eci.icc" }
}
```

### Resize
`POST /v1/operations/resize`
```json
{
  "asset_id": "uuid",
  "options": {
    "width_mm": 210,
    "height_mm": 297,
    "fit_mode": "fit"
  }
}
```

### Merge
`POST /v1/operations/merge`
```json
{
  "asset_ids": ["uuid1", "uuid2", "uuid3"],
  "output_filename": "merged.pdf"
}
```

### N-up
`POST /v1/operations/nup`
```json
{
  "asset_id": "uuid",
  "options": {
    "columns": 2,
    "rows": 2,
    "page_width_mm": 320,
    "page_height_mm": 450
  }
}
```

### Sheet imposition with bleed and crop marks
`POST /v1/operations/impose-sheet`
```json
{
  "asset_id": "uuid",
  "columns": 2,
  "rows": 4,
  "sheet_width_mm": 320,
  "sheet_height_mm": 450,
  "bleed_mm": 3,
  "gap_mm": 2,
  "outer_margin_mm": 8,
  "show_crop_marks": true,
  "show_bleed_outline": false
}
```

### Booklet
`POST /v1/operations/booklet`
```json
{
  "asset_id": "uuid",
  "options": {
    "sheet_width_mm": 420,
    "sheet_height_mm": 297
  }
}
```

## 7. Poll the operation job
Each operation returns a `job_id`.
Poll `GET /v1/jobs/{job_id}`.
When complete, the result contains:
- `storage_path`

That output becomes your next document to preview or download.

## 8. Suggested Lovable screens

### Upload screen
- drag and drop file
- upload progress
- processing status

### Document builder screen
- thumbnail
- filename
- page size
- trim/bleed info
- buttons for rotate / grayscale / resize / merge

### Print prep screen
- choose product size
- choose color mode
- choose impose type
- run impose job
- preview final proof

### Admin/internal screen
- link to `/admin`
- monitor failed jobs
- retry or cancel

## 9. Suggested frontend job polling rule
Poll every 2 to 3 seconds while status is:
- queued
- running

Stop polling when status is:
- completed
- failed
- cancelled

## 10. Important practical tip
Treat every new processed output as a new file version in your app.
Do not overwrite the original user upload in your app logic.
