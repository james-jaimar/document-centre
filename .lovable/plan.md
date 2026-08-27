# Template picker: slide-out thumbnail gallery

Replace the "Layout" dropdown in the customer artwork editor with a left slide-out panel showing a vertical list of template thumbnails, and give admins a thumbnail per template.

## 1. Admin — thumbnail per template

In the artwork templates tab (per layout):

- **Auto thumbnail**: when a base PDF is uploaded or re-detected, render page 1 (trim-cropped, same path already used for previews) and store it as the template's preview image.
- **Manual override**: an "Upload thumbnail" button (PNG/JPG) next to the base PDF controls, with a small preview tile and a "Reset to auto" action.
- Thumbnail is stored in the existing `preview_path` column on `artwork_templates` (already present, currently unused) — no schema change needed.
- Thumbnails render in the admin layout list so it's obvious which layout is which there too.

## 2. Customer — slide-out picker

- The left rail's Layout `<select>` becomes a **"Change layout"** card: current template's thumbnail, name, page count, and a button that opens the panel.
- Panel slides in from the left (Sheet, side="left", ~380px wide, full height), titled "Choose a layout".
- Vertical scrolling list of published templates: large thumbnail, name, page count, and a check/ring on the current selection. Click selects, applies, and closes.
- If a customer has already placed artwork, switching layout warns first ("Your uploaded artwork stays; boxes that don't exist in the new layout will be dropped") — placeholder values are keyed by placeholder id, so unmatched ones are simply unused.
- Templates without a thumbnail fall back to a rendered page-1 preview on the fly, then a neutral placeholder tile.
- Panel is also reachable from the editor top bar so it's available when the left rail is scrolled.

## Technical notes

- Files: `src/components/admin/ArtworkTemplatesTab.tsx` (thumbnail upload/auto-generate + list tiles), `src/pages/dashboard/TemplatedArtworkBuilder.tsx` (replace select with trigger card), new `src/components/artwork/TemplatePickerSheet.tsx`.
- Thumbnails uploaded to the same storage bucket/prefix as base PDFs, signed via the existing thumbnail URL helper.
- Auto-generation reuses `rasterisePdfPages` (page 1 only) and downsamples to ~600px wide JPEG to keep files small.
- No pricing, spec, or PDF-server changes.
