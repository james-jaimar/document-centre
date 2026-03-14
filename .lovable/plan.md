

# Document Management Engine -- Architecture Plan

## Current State

**Database already has:** `product_families`, `product_options`, `branch_capabilities`, `pricing_rules`, plus enums for `build_status`, `document_status`, `order_status`. No tables yet for orders, documents, or document builds.

**PDF server can:** preflight, page-boxes, analyze, rotate, crop, split, CMYK convert, label imposition.

**PDF server cannot:** rasterize PDF pages to PNG/JPEG for thumbnails and flipbook preview. This is the critical missing piece.

---

## VPS Gap: Rasterization Endpoint

Your server uses Ghostscript already (for CMYK conversion). You need one new endpoint:

```text
POST /rasterize
{
  "pdf_url": "...",
  "pages": [1, 2, 3],       // optional, defaults to all
  "dpi": 150,               // 150 for preview, 72 for thumbnails
  "format": "png",          // png or jpeg
  "max_width": 800          // optional pixel cap
}

Response:
{
  "pages": [
    { "page": 1, "image_base64": "...", "width": 800, "height": 1035 },
    ...
  ]
}
```

Ghostscript command under the hood:
`gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r150 -dFirstPage=N -dLastPage=N -sOutputFile=...`

**Action required from you:** Add this endpoint to your VPS. Once done, we add `"rasterize"` to the Edge Function's `ALLOWED_PATHS`.

---

## Database Schema (new tables)

```text
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│     orders      │────▶│   order_items     │────▶│    documents      │
│                 │     │ (one per product) │     │ (uploaded files)  │
│ user_id         │     │ product_family_id │     │ file_path         │
│ tenant_id       │     │ build_status      │     │ document_status   │
│ order_status    │     │ quantity          │     │ page_count        │
│ total_price     │     │ unit_price        │     │ preflight_data    │
└─────────────────┘     │ spec (jsonb)      │     │ thumbnail_urls    │
                        └──────────────────┘     └───────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │ document_sections │
                        │ (body, cover,    │
                        │  inserts, tabs)  │
                        │                  │
                        │ section_type     │
                        │ document_id      │
                        │ page_range       │
                        │ paper_stock      │
                        │ is_color         │
                        │ is_duplex        │
                        │ sort_order       │
                        └──────────────────┘
```

### Key tables:

**orders** -- top-level container per customer checkout
- `id`, `user_id`, `tenant_id`, `branch_id`, `order_status` (enum), `total_price`, `fulfillment_type`, `created_at`

**order_items** -- one row per product in the order (a booklet, a bound doc, etc.)
- `id`, `order_id`, `product_family_id`, `quantity`, `unit_price`, `build_status` (enum), `spec` (JSONB storing binding type, cover options, finishing, etc.), `created_at`

**documents** -- each uploaded file
- `id`, `order_item_id`, `file_name`, `file_path` (storage path), `file_size`, `mime_type`, `page_count`, `page_width_mm`, `page_height_mm`, `document_status` (enum), `preflight_data` (JSONB), `thumbnail_urls` (JSONB array), `sort_order`, `created_at`

**document_sections** -- sub-divisions of a document (body pages, front cover, back cover, inserts)
- `id`, `order_item_id`, `document_id` (nullable -- cover might have no file), `section_type` (enum: `body`, `front_cover`, `back_cover`, `insert`, `tab`), `page_range_start`, `page_range_end`, `paper_stock`, `paper_weight_gsm`, `is_color`, `is_duplex`, `lamination`, `sort_order`

### Storage bucket:
- `document-uploads` -- private bucket, RLS by user_id
  - `{tenant_id}/{order_id}/{document_id}/original.pdf`
  - `{tenant_id}/{order_id}/{document_id}/thumbnails/page-001.png`

---

## Customer UI Flow (5 screens)

### Screen 1: Product Selection
Grid of product family cards (Bound Documents, Booklets, Stapled, Ring Binders, Posters, Flyers). Each card shows icon, name, description. Clicking opens sub-types if applicable (e.g., Spiral, Twinloop, Comb under Bound Documents).

### Screen 2: File Upload
Drag-and-drop zone. Accepts PDF, DOCX, PPTX, images. On upload:
1. Store to Supabase Storage
2. Call `/preflight` via Edge Function -- get page count, dimensions, color info, warnings
3. Call `/rasterize` (once you add it) -- generate thumbnails for all pages
4. Show upload progress, then analysis results (page count, size, any warnings like low-res images)

### Screen 3: Document Builder (the heart -- inspired by Mimeo)
Split layout:
- **Left panel** (scrollable accordion): Binding, Covers, Paper, Print Color & Plex, Finishing, Sections
- **Right panel**: Live flipbook preview showing the document as it will print

Key behaviors:
- Selecting "Black & White" desaturates all preview thumbnails in real-time (CSS filter)
- Adding covers inserts cover pages at front/back of the flipbook
- Color cover + B&W body shows mixed preview
- Section management lets users define page ranges with different paper/color settings
- Quantity selector + live price calculation

### Screen 4: Preview & Proof
Full flipbook view with page-turn animation. Shows:
- Cover pages (if configured) with appropriate rendering
- Body pages with correct color treatment
- Page numbers, document title
- "Inside Front Cover" / "Inside Back Cover" labels like Mimeo
- Zoom in/out controls

### Screen 5: Summary & Add to Cart
Document specification summary (like Doxzoo's right panel): Product type, paper, color, pages, copies, covers, binding, price breakdown. "Add to Cart" or "Checkout" button.

---

## Implementation Phases

**Phase 1 -- Foundation (do first)**
1. Create DB tables (orders, order_items, documents, document_sections) + storage bucket + RLS policies
2. Add `rasterize` to Edge Function allowed paths (you add the endpoint to VPS)
3. Build `usePdfApi` hook with retry logic for 503s

**Phase 2 -- Admin Product CRUD**
4. Build AdminProducts page: CRUD for product_families and product_options
5. Seed initial product families (Spiral Bound, Saddle Stitch, Comb Bound, Ring Binder, Stapled)

**Phase 3 -- Customer Upload & Analysis**
6. File upload component with drag-and-drop + Supabase Storage
7. Post-upload preflight analysis + thumbnail generation pipeline
8. Document status tracking (pending → uploading → processing → analyzed → ready)

**Phase 4 -- Document Builder UI**
9. Split-panel layout with accordion configuration panel
10. Flipbook preview component using rasterized thumbnails
11. Section management (body, covers, inserts)
12. Live color/B&W preview toggle (CSS `filter: grayscale(1)`)
13. Live pricing calculation

**Phase 5 -- Cart & Checkout**
14. Order summary component
15. Cart management
16. Order placement flow

---

## VPS Action Item

Before Phase 3 can work, you need to add the `/rasterize` endpoint to your Python VPS. It is a straightforward Ghostscript wrapper. If you want, I can write the Python code for that endpoint in a separate conversation with your other Lovable project.

---

## Technical Notes

- Flipbook can be built with CSS transforms (no heavy library needed) -- 3D page-turn effect using `transform: rotateY()` with thumbnail images as page faces
- B&W preview is pure CSS: `filter: grayscale(1)` on the thumbnail `<img>` elements per section
- Cover pages are separate document_sections with their own color/paper settings
- The `spec` JSONB on `order_items` stores the full configuration snapshot at time of order for audit/reprinting
- All thumbnails stored in Supabase Storage with signed URLs for the flipbook

