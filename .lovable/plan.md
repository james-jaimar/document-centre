# Plan: make the job ticket a true production source-of-truth

## What I found

- The VPS is now rendering the new code, but the current layout has defects:
  - Logo is placed on a red brand band, so the red PostNet logo disappears.
  - Header text and job title can collide/overlap.
  - The ticket still includes a pricing panel, which should not be on a work ticket.
  - The production specs section is mostly empty because the renderer reads only a few legacy keys (`paper`, `binding`, etc.), while the admin UI gets the real details from `job.configuration.summary` and `job.configuration.sections`.
  - Documents show “No source files attached” because the renderer uses `bundle.documents`, but for current snapshot-based jobs the source files are resolved into `bundle.asset_paths` instead.

## Changes to make

### 1. Rebuild the PDF layout for print-shop use
Update `pdf-server/app/tasks/production_tasks.py`:

- Use a clean white header instead of a solid red band.
- Put the PostNet/tenant logo inside a white logo box so it is visible regardless of brand colour.
- Use brand colour only for a thin accent rule, section headings, and small labels.
- Keep the QR code top-right, but prevent it from squeezing/overlapping the job title.
- Remove pricing entirely.
- Add writable fields for:
  - Due date
  - Operator
  - Started
  - Completed
  - QC
  - Notes

### 2. Mirror the admin Job Details panel
Use the same data sources as `JobDetailPanel.tsx`:

- Job ID / job number
- Job name / product
- Category
- Quantity, unit label, sent, remaining
- Status, proof status, urgency
- Primary summary specs:
  - Size
  - Pages
  - Any other `configuration.summary.primary_spec_*` values
- Full `configuration.sections[]` output, including examples shown in the admin screenshot:
  - Document / Pages
  - Standard sizes / Document Size
  - Printed covers
  - Cover lamination
  - White paper / Paper Stock
  - Print to edge
  - Print / Print Colour / Print Sides
  - Document sections / Body colour-duplex rules
  - Files / file name, page count, size
  - Net price should be excluded from the ticket

### 3. Fix source-file listing
Still in `production_tasks.py`:

- Render files from `bundle.documents` when available.
- If `bundle.documents` is empty, fall back to `bundle.asset_paths` so snapshot jobs show files like `8pp A4.pdf` instead of “No source files attached”.
- Include file name and any available page/size metadata; if only `asset_paths` are available, show the filename and mark unknown metadata as `—`.

### 4. Improve data loading if needed
Update `pdf-server/app/services/production_orchestrator.py` only if required:

- Ensure the selected `order_item` query carries enough detail for future renderer use (`spec`, `title`, `quantity`, possibly price fields only if already present, but pricing will not be printed).
- Do not add migrations.

### 5. Make regeneration explicit from the admin UI
Update the app-side call path:

- `src/hooks/useProductionArtefacts.ts`: let `generateJobTicket({ force: true })` pass `force` to `production-pdf`.
- `src/components/orders/detail/ProductionPanel.tsx`: when a ticket already exists, the “Re-generate” button should call `force: true` so operators get the new layout after renderer updates.

The Supabase edge function already forwards `force`, and the VPS route accepts the field, so this is mainly UI/hook wiring.

## Validation

- Generate a sample ticket locally from a representative `JobBundle` shape based on the screenshot.
- Convert the PDF page to an image and inspect it for:
  - No logo/header collision
  - No overlapping job title text
  - No pricing block
  - Admin-visible specs present
  - Files listed correctly
  - Enough writable production space
- After merging/deploying, redeploy `pdf-server` and click **Re-generate** on `INV-00069-1`.