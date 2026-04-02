

# Plan: Smart 2-Page PDF Handling for Brochures

## Problem

When a user uploads a 2-page PDF for a brochure, the system doesn't know what to do with it. The user has to manually assign it as "Outside" or "Inside", but the document contains both sides. Assigning a 2-page PDF as "Outside" uses only page 1 and discards page 2. There's no way to split or auto-assign.

For brochures, a 2-page PDF almost always means: page 1 = Outside, page 2 = Inside.

## Solution

Add a third action button for brochures: **"Auto-assign (Outside + Inside)"** that appears when the selected document has 2+ pages. When clicked, it creates two sections from the same document — one for each side — using page indices to distinguish them.

For the preview, update `foldThumbnails` to use `thumbnail_urls[0]` for Outside and `thumbnail_urls[1]` for Inside when both sections reference the same 2-page document.

## Changes

| File | Change |
|------|--------|
| `src/components/order/SectionActions.tsx` | Add a conditional "Auto-assign Outside + Inside" button for brochures when selected doc has 2+ pages. Pass `pageCount` as a new prop. |
| `src/pages/dashboard/OrderFiles.tsx` | Add a new `handleAutoAssignBrochure` handler that creates two sections from the same document (front_cover + back_cover). Pass selected doc's page count to `SectionActions`. |
| `src/components/order/PreviewPanel.tsx` | Update `foldThumbnails` logic: when outside and inside sections share the same document, use `thumbnail_urls[0]` for outside and `thumbnail_urls[1]` for inside. |

## Detail

### Auto-assign flow
1. User uploads 2-page PDF
2. Selects it in file list
3. Sees new button: **"Auto-assign (Outside + Inside)"** — prominent, above the manual options
4. Click creates two sections: `front_cover` (page 1) and `back_cover` (page 2), both pointing to the same document ID
5. Preview picks up `thumbnail_urls[0]` for outside, `thumbnail_urls[1]` for inside

### Section data model
Both sections reference the same `document_id`. A new field `page_index` (or reuse `page_range_start`) distinguishes which page of the document each section represents. The preview uses this to select the correct thumbnail.

### Single-page handling unchanged
If the doc has 1 page, the auto-assign button is hidden. User assigns manually as before.

