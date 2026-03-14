

# Rasterize Endpoint for Your VPS

I've reviewed your VPS codebase. Here's exactly what you need to add.

## What to do

You need to add two things to your VPS:

### 1. Add `rasterize` method to `app/services/ghostscript.py`

Add this method to the `GhostscriptService` class:

```python
async def rasterize_pages(
    self,
    input_path: Path,
    output_dir: Path,
    pages: list[int] | None = None,
    dpi: int = 150,
    fmt: str = "png",
    max_width: int | None = None,
) -> list[dict]:
    """Render PDF pages to PNG/JPEG images using Ghostscript."""
    import base64

    device = "png16m" if fmt == "png" else "jpeg"
    ext = fmt

    # Get page count if no specific pages requested
    if not pages:
        # Use pdfcpu or gs to get page count
        cmd_count = [
            self.gs_path, "-dNODISPLAY", "-dBATCH", "-dNOPAUSE",
            "-c", f"({input_path}) (r) file runpdfbegin pdfpagecount = quit"
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd_count,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        total = int(stdout.decode().strip())
        pages = list(range(1, total + 1))

    results = []
    for page_num in pages:
        out_file = output_dir / f"page-{page_num:04d}.{ext}"

        cmd = [
            self.gs_path,
            "-dSAFER", "-dBATCH", "-dNOPAUSE",
            f"-sDEVICE={device}",
            f"-r{dpi}",
            f"-dFirstPage={page_num}",
            f"-dLastPage={page_num}",
            "-dTextAlphaBits=4",
            "-dGraphicsAlphaBits=4",
            f"-sOutputFile={out_file}",
            str(input_path),
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise PDFProcessingError(
                f"Ghostscript rasterize failed on page {page_num}: {stderr.decode()}"
            )

        # Optional resize with Pillow if max_width set
        if max_width:
            from PIL import Image
            img = Image.open(out_file)
            if img.width > max_width:
                ratio = max_width / img.width
                new_h = int(img.height * ratio)
                img = img.resize((max_width, new_h), Image.LANCZOS)
                img.save(out_file)

        # Read and encode
        from PIL import Image
        img = Image.open(out_file)
        w, h = img.size

        with open(out_file, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        results.append({
            "page": page_num,
            "image_base64": b64,
            "width": w,
            "height": h,
            "format": fmt,
        })

    return results
```

### 2. Add the route to `app/api/routes.py`

Add a new endpoint (following the same pattern as your other routes -- using the capacity manager, temp file download, etc.):

```python
@api_router.post("/rasterize")
async def rasterize_pdf(request: Request):
    """Rasterize PDF pages to PNG/JPEG images."""
    body = await request.json()
    pdf_url = body.get("pdf_url")
    pages = body.get("pages")          # optional list of ints
    dpi = body.get("dpi", 150)         # default 150
    fmt = body.get("format", "png")    # png or jpeg
    max_width = body.get("max_width")  # optional pixel cap

    if not pdf_url:
        raise HTTPException(400, "pdf_url is required")
    if fmt not in ("png", "jpeg"):
        raise HTTPException(400, "format must be 'png' or 'jpeg'")
    if dpi < 36 or dpi > 600:
        raise HTTPException(400, "dpi must be between 36 and 600")

    capacity: CapacityManager = request.app.state.capacity_manager
    async with capacity.acquire(timeout=settings.job_acquire_timeout_seconds):
        with tempfile.TemporaryDirectory(dir=settings.temp_dir) as tmp:
            tmp_path = Path(tmp)
            input_pdf = tmp_path / "input.pdf"

            # Download the PDF
            await download_file(pdf_url, input_pdf)

            # Rasterize
            gs = GhostscriptService()
            results = await gs.rasterize_pages(
                input_path=input_pdf,
                output_dir=tmp_path,
                pages=pages,
                dpi=dpi,
                fmt=fmt,
                max_width=max_width,
            )

    return {"pages": results}
```

### 3. Dependency

You'll need **Pillow** for the optional `max_width` resize. Add it to your `requirements.txt`:
```
Pillow>=10.0
```

If Pillow is already installed (likely, since many PDF tools use it), you're good.

## Files to edit

| File | Action |
|------|--------|
| `app/services/ghostscript.py` | Add `rasterize_pages` method |
| `app/api/routes.py` | Add `/rasterize` endpoint |
| `requirements.txt` | Add `Pillow>=10.0` if not present |

## Already done on this side

The Edge Function proxy already has `"rasterize"` in `ALLOWED_PATHS`, and the `usePdfApi` hook handles retry logic for 503 responses. Once you deploy the VPS update, the full pipeline will work.

## Usage from Lovable

```typescript
const { invoke } = usePdfApi();

const result = await invoke("rasterize", {
  pdf_url: signedUrl,
  pages: [1, 2, 3],
  dpi: 150,
  format: "png",
  max_width: 800,
});
// result.pages = [{ page: 1, image_base64: "...", width: 800, height: 1035 }, ...]
```

