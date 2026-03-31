

# Revised Plan: TrimBox Thumbnails + Preserve Original for Print

## Key Insight
The original uploaded PDF (with full bleed and crop marks) is already preserved on the server as the `source_storage_path`. The `normalized_storage_path` is a linearized copy. The `crop-rasterize` operation only generates new **thumbnail/preview images** — it does NOT modify the source or normalized PDF. So the print-ready file is always available.

## Server Changes (4 files on Ubuntu server)

### 1. `app/services/pdf_ops.py` — Add `crop_to_box` method
Crops a **temporary copy** of the PDF for rasterization only. The original/normalized PDF is untouched.

```python
def crop_to_box(self, src: Path, out_pdf: Path, box: list[float]) -> Path:
    with pikepdf.open(src) as pdf:
        for page in pdf.pages:
            page.MediaBox = box
            page.CropBox = box
            for attr in ('TrimBox', 'BleedBox'):
                if hasattr(page, attr):
                    del page[f'/{attr}']
        pdf.save(out_pdf)
    return out_pdf
```

### 2. `app/schemas/assets.py` — Add request schema
```python
class CropRasterizeRequest(BaseModel):
    asset_id: UUID
    box: list[float] = Field(min_length=4, max_length=4)
    dpi: int = Field(default=120, ge=36, le=600)
```

### 3. `app/tasks/operation_tasks.py` — Add `crop_rasterize` task
- Downloads the normalized PDF
- Crops a **temporary copy** to the given box coordinates
- Rasterizes the cropped copy into preview + thumbnail images
- Stores as derived files, updates asset's thumbnail/preview paths
- The normalized and source PDFs remain unchanged (print-ready)

### 4. `app/web/routes.py` — Add endpoint
```python
@api_router.post("/operations/crop-rasterize")
def op_crop_rasterize(payload: CropRasterizeRequest, db=Depends(get_db)):
    ...
    return {"job_id": job_id}
```

### Server restart
```bash
sudo systemctl restart document-centre-api document-centre-worker
```

## Client Changes (2 files in Lovable)

### 5. `src/lib/documentCentreApi.ts` — Add `cropRasterize()` function

### 6. `src/hooks/useDocumentUpload.ts` — After initial processing
- If TrimBox exists and differs from MediaBox, call `cropRasterize` with TrimBox coordinates
- Poll the job, then re-fetch derived files for cropped thumbnails
- The `documents` table continues to store `backend_asset_id` pointing to the full original asset — so when final print output is needed, the system fetches the normalized/source PDF (which retains all bleed and crop marks)

## Data flow summary

```text
UPLOAD & DISPLAY:
  Original PDF (with bleed) → stored as source_storage_path (PRESERVED)
  Normalized PDF → stored as normalized_storage_path (PRESERVED)
  crop_rasterize → temporary cropped copy → thumbnails only
  UI shows trimmed thumbnails + correct trim dimensions

FINAL PRINT OUTPUT:
  System retrieves normalized_storage_path (or source_storage_path)
  → Full bleed + crop marks intact → sent to press
```

No changes needed to the data model — the original print-ready file is already preserved by design.

