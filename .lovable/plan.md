

# Fix: Page-boxes Response Parsing + Update Allowed Paths

## Two Issues Found

### Issue 1: Wrong response shape assumed for `/page-boxes`
The VPS returns a **flat object**:
```json
{"mediabox": {"width": 612, "height": 792, ...}, "page_count": 1}
```
But the code at line 58-62 expects `result.pages[]` (an array of page objects). Since `pbData.pages` is `undefined`, `pageCount` becomes 0, and the DB update writes `page_count: null`.

### Issue 2: Rasterize 422 (Ghostscript crash)
This is a VPS-side issue -- Ghostscript can't process this particular PDF. The current code already handles this gracefully with a toast. No client-side fix possible.

### Issue 3: ALLOWED_PATHS incomplete
Per the full API docs you just shared, `analyze-pdf` and `preflight` are valid endpoints that should be in the allowed list.

## Plan

### 1. Fix page-boxes response parsing (`src/hooks/useDocumentUpload.ts`)
- Read `pbData.page_count` directly (it's a top-level field, not derived from an array)
- Read dimensions from `pbData.mediabox.width` and `pbData.mediabox.height` (in points)
- Convert points to mm: `width_pts * 25.4 / 72`

### 2. Update ALLOWED_PATHS (`supabase/functions/pdf-api/index.ts`)
- Add `analyze-pdf` and `preflight` to the allowed paths list

| File | Change |
|------|--------|
| `src/hooks/useDocumentUpload.ts` | Fix lines 57-62: read `page_count` from top level, read dimensions from `mediabox` with pt-to-mm conversion |
| `supabase/functions/pdf-api/index.ts` | Add `analyze-pdf` and `preflight` to ALLOWED_PATHS |

