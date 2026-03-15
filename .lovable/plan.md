

# Document Builder -- Two-Step Flow Plan

## Overview

The document builder is the core customer-facing experience. It replicates and improves on Mimeo's approach with a modern, two-step flow:

**Step 1: File Manager** -- Upload PDFs, assign them to sections (cover, body, inserts), get thumbnails from the PDF server, reorder sections.

**Step 2: Configurator + Preview** -- Left panel shows all product options as an accordion. Right panel shows a live flipbook preview with page thumbnails. Price updates in real-time.

## What We Already Have

- `orders` / `order_items` / `documents` / `document_sections` tables -- fully ready
- `product_families` / `product_options` with structured JSONB values (groups, price impacts, metadata)
- `pricing_rules` with condition matching
- `calculateItemPrice()` engine combining both pricing layers
- `usePdfApi` hook for calling the VPS via Edge Function (`/analyze-pdf`, `/rasterize`, `/preflight`)
- `build_status` enum: `draft → building → ready → quoted → ordered`
- `document_status` enum: `pending → uploading → processing → analyzed → ready → error`
- `section_type` enum: `body | front_cover | back_cover | insert | tab`
- Supabase Storage for file uploads

## Route Structure

```text
/dashboard/orders/new          → Product picker (choose Bound Documents, etc.)
/dashboard/orders/:id/files    → Step 1: File Manager
/dashboard/orders/:id/build    → Step 2: Configurator + Preview
```

All three routes are nested inside the existing `AppLayout` with the sidebar.

---

## Step 1: File Manager (`/dashboard/orders/:id/files`)

Three-column layout inspired by Mimeo's screenshot but modernized:

```text
┌─────────────────┬──────────────┬─────────────────────┐
│  UPLOADED FILES  │   ACTIONS    │   YOUR DOCUMENT     │
│                  │              │                     │
│  ┌────────────┐  │   [Add →]    │  Section 1: Cover   │
│  │ thumb  name│  │   [Replace]  │  ┌──────┐ 1 page    │
│  │ 24pg  cover│  │   [Remove]   │  │thumb │ 250gsm    │
│  ├────────────┤  │   [Remove ∀] │  └──────┘           │
│  │ thumb  body│  │              │  Section 2: Body    │
│  │ 64pg  A4   │  │   [Move ↑]   │  ┌──────┐ 64 pages  │
│  └────────────┘  │   [Move ↓]   │  │thumb │ 80gsm     │
│                  │              │  └──────┘           │
│  [+ Upload More] │              │  Per-section icons: │
│                  │              │  🔲 B&W  🎨 Color   │
│                  │              │  📄 1-side 📑 2-side │
└─────────────────┴──────────────┴─────────────────────┘
                                    [Continue →]
```

### Upload Flow
1. User drops PDF files or clicks upload
2. Files go to Supabase Storage (`documents` bucket, path: `{user_id}/{order_item_id}/{filename}`)
3. A `documents` row is created with `status: uploading`
4. On upload complete, call VPS `/analyze-pdf` via `usePdfApi` to get page count, dimensions, preflight issues
5. Call VPS `/rasterize` to generate page thumbnails (stored in `thumbnail_urls` JSONB)
6. Status moves to `analyzed` then `ready`

### Section Assignment
- User selects a file from the left panel, then clicks "Add as Cover" or "Add as Body" on the action panel
- This creates `document_sections` rows linking the document to the order item
- Per-section overrides for colour/plex shown as toggle icons on each section card (much clearer than Mimeo's tiny icons)
- Sections are reorderable via drag or move up/down buttons

### Improvements Over Mimeo
- Drag-and-drop upload zone instead of modal picker
- Clearer section assignment with labelled buttons instead of ambiguous "Add"
- Per-section colour/plex toggles use filled/outlined icon pairs with text labels on hover, not tiny hard-to-read icons
- Progress indicators during PDF analysis
- Preflight warnings shown inline (e.g. "Page 3 has low resolution images")

---

## Step 2: Configurator + Preview (`/dashboard/orders/:id/build`)

Split-panel layout:

```text
┌──────────────────────────┬──────────────────────────────────┐
│  OPTIONS PANEL (320px)    │  PREVIEW PANEL                   │
│                          │                                  │
│  BOUND DOCUMENT (A4)     │      ┌──────────────────┐        │
│                          │      │                  │        │
│  ▼ BINDING               │      │   Page thumbnail │        │
│    Spiral (Black) ▸      │      │   with binding   │        │
│    No Hole Punch  ▸      │      │   edge rendered  │        │
│                          │      │                  │        │
│  ▼ COVERS                │      └──────────────────┘        │
│    Matte + Black Back ▸  │            Page 1 / 70           │
│    ☑ Print First Page    │                                  │
│                          │  ┌──────────────────────────┐    │
│  ▼ PAPER                 │  │ ◀◀  ◀  ━━━●━━━━━  ▶  ▶▶ │    │
│    80gsm White Bond ▸    │  └──────────────────────────┘    │
│                          │                                  │
│  ▼ PRINT COLOR & PLEX   │  Section: Cover │ Pg 1-2         │
│    Mixed          ▸      │                                  │
│    Duplex         ▸      │                                  │
│    ☐ Rotate backs 180°   │                                  │
│                          │                                  │
│  ▼ LAMINATION            │                                  │
│    No Lamination  ▸      │                                  │
│                          │                                  │
│  ▼ INSERTS               │                                  │
│    Tabs           [0] ▸  │                                  │
│    Slip Sheets    [0] ▸  │                                  │
│                          │                                  │
│  ▼ FINISHING             │                                  │
│    No Shrink Wrap ▸      │                                  │
├──────────────────────────┤                                  │
│  Qty: [1]  [-] [+]      │                                  │
│  Price: R 245.80         │                                  │
│  [Add to Cart]           │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

### Options Panel
- Reads `product_options` for the selected product family
- Each option rendered as a collapsible accordion section
- Values grouped by their `group` field (e.g. "Standard" vs "Ring Binders" under Binding)
- Clicking a value opens a popover/dropdown showing grouped choices
- Selected value shown inline with a chevron
- When "Mixed (Set by Section)" is chosen for colour or plex, a sub-panel expands showing each document section with individual toggles
- Checkboxes for boolean options (Print First Page in Color, Rotate backs)

### Preview Panel
- Thumbnails loaded from `documents.thumbnail_urls` (generated by VPS `/rasterize`)
- Page navigation: first, prev, slider, next, last, plus page number input
- Current section indicator at bottom (e.g. "Section: Cover | Pg 1-2")
- Visual binding edge rendered as a CSS overlay on the left side of the page (spiral dots, comb teeth, etc. as simple SVG patterns)
- B&W pages shown with `filter: grayscale(1)` on the thumbnail
- Duplex pages shown in pairs; simplex pages show blank reverse

### Price Calculation
- Uses existing `calculateItemPrice(spec, options, rules)` 
- Recalculates on every option change
- Shows breakdown on hover/click of the price (line items from `PriceBreakdown`)

---

## New Order Flow (Product Picker)

Before Step 1, the user needs to pick a product type. Route: `/dashboard/orders/new`

- Shows active `product_families` as cards (icon, name, description)
- Clicking a card creates a draft `order` + `order_item` linked to that product family
- Navigates to `/dashboard/orders/:id/files`

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/pages/dashboard/NewOrder.tsx` | Create | Product family picker grid |
| `src/pages/dashboard/OrderFiles.tsx` | Create | Step 1: three-column file manager |
| `src/pages/dashboard/OrderBuild.tsx` | Create | Step 2: configurator + preview shell |
| `src/components/order/FileUploader.tsx` | Create | Drag-drop upload zone with progress |
| `src/components/order/FileList.tsx` | Create | Left panel: uploaded files with thumbnails |
| `src/components/order/SectionList.tsx` | Create | Right panel: document sections with per-section controls |
| `src/components/order/SectionActions.tsx` | Create | Middle panel: Add/Remove/Move buttons |
| `src/components/order/OptionsPanel.tsx` | Create | Accordion configurator reading product_options |
| `src/components/order/OptionSelector.tsx` | Create | Single option row with grouped value picker |
| `src/components/order/PreviewPanel.tsx` | Create | Flipbook preview with page navigation |
| `src/components/order/PriceSummary.tsx` | Create | Quantity selector + live price + breakdown |
| `src/components/order/BindingOverlay.tsx` | Create | SVG binding edge visual for preview |
| `src/hooks/useOrderBuilder.ts` | Create | State management for the builder (current order item, spec, sections) |
| `src/hooks/useDocumentUpload.ts` | Create | Upload to Storage + create documents row + trigger PDF analysis |
| `src/App.tsx` | Edit | Add 3 new routes |

### Dependencies on existing infrastructure
- **VPS `/analyze-pdf`**: Returns page count, dimensions, preflight data -- stored in `documents` row
- **VPS `/rasterize`**: Returns thumbnail URLs per page -- stored in `documents.thumbnail_urls`
- **Supabase Storage**: `documents` bucket for PDF uploads
- **`calculateItemPrice`**: Already built, called by `PriceSummary`
- **`useProductOptions`**: Already built, used by `OptionsPanel`
- **`usePdfApi`**: Already built, used by upload flow

### No new migrations needed
All required tables, enums, and columns already exist: `orders`, `order_items`, `documents`, `document_sections`, `product_families`, `product_options`, `pricing_rules`.

---

## Build Priority

Given the size of this feature, I recommend building it in 3 increments:

1. **Increment 1**: Product picker + file manager (NewOrder + OrderFiles pages, upload flow, section assignment). This is the foundation -- getting files in and analyzed.

2. **Increment 2**: Configurator options panel (OptionsPanel + OptionSelector reading from product_options, spec state management, price calculation). This is the business logic core.

3. **Increment 3**: Preview panel with flipbook (thumbnail display, page navigation, binding overlay, grayscale filter). This is the visual polish.

Each increment produces a usable, testable feature.

