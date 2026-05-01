## Problem

When uploading a Word document (.docx), the pdf-server's normalize pipeline fails with:
```
TypeError: Object of type Decimal is not JSON serializable
```

This happens in `job_repo.mark_done()` (jobs.py line 28) when `json.dumps(result)` tries to serialize the `info` dict returned by `pdf_ops.inspect()`. The pikepdf library occasionally returns `decimal.Decimal` values (e.g. for `pdf_version` or box coordinates) depending on the PDF structure produced by LibreOffice's Office-to-PDF conversion.

## Fix (pdf-server only — 2 files)

### 1. `pdf-server/app/services/jobs.py` — Add a Decimal-safe JSON encoder

Add a custom `json.dumps` default handler (or a `DecimalEncoder` class) that converts `Decimal` to `float`. Apply it to both `create_job` (line 15) and `mark_done` (line 28) calls.

```python
import decimal

def _default_serializer(obj):
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

# Then use: json.dumps(result, default=_default_serializer)
```

### 2. `pdf-server/app/services/pdf_ops.py` — Belt-and-suspenders cast in `inspect()`

Line 205: cast `pdf_version` to `str` explicitly:
```python
"pdf_version": str(pdf.pdf_version),
```

This is a defence-in-depth fix. The real serialization guard is in jobs.py.

## Scope

- Only the pdf-server Python codebase is changed
- No database migrations
- No frontend changes
- No edge function changes
