## Goal — Option B: admin-managed imposition presets

You define a small library of imposition templates ahead of time (e.g. "1-up A4 cut sheet", "2-up SRA3 with 5 mm gap, bleed, crop marks"). Per product family, you whitelist which templates are allowed. Operators on the Production panel just pick from that short list — no parameters to tweak.

Today's `imposition_templates` table only supports **press-sheet PDF artwork** (admin uploads a sheet with marks/bars baked in, worker stamps slot rectangles). That's overkill for most cut-sheet jobs and means producing a PDF for every preset. We extend the same table with a **parametric mode** so most presets are just rows of numbers — no PDF needed.

## Architecture

`imposition_templates.kind` decides which engine runs on the VPS:

| `kind` | Engine | Required fields | Use case |
|---|---|---|---|
| `template_pdf` (existing) | `impose_with_template` | `template_pdf_path`, `slots`, `n_up` | Branded press sheets with colour bars |
| `parametric_nup` (new) | `impose_nup_trimbox` | `columns`, `rows`, output sheet, bleed, gutter, crop-mark params | Cut-sheet n-up (the common case) |
| `parametric_booklet` (new) | `booklet_saddle_stitch` | output sheet, bleed, `creep_per_sheet_mm` | Saddle-stitched booklets |

Per-product whitelist already exists: `product_imposition_defaults(product_family_id, imposition_template_id, is_primary, sort_order)`. We're keeping that.

## Steps

### 1. DB migration (needs your approval)

Add to `imposition_templates`:
- `kind text not null default 'template_pdf'` with check constraint
- `columns int`, `rows int` — parametric n-up grid
- `bleed_mm numeric default 3`
- `gutter_mm numeric default 0`
- `crop_mark_offset_mm numeric default 3`, `crop_mark_length_mm numeric default 5`
- `show_registration boolean default true`
- `creep_per_sheet_mm numeric default 0` — booklet only
- `fallback_trim_inset_mm numeric default 0`
- Make `template_pdf_path`, `slots` legitimately nullable (n_up stays required, defaulted from columns × rows for parametric)

No data loss — existing template_pdf rows get `kind='template_pdf'` and keep working.

### 2. pdf-server worker (`assemble_imposed_sheet_for_job`)

In `pdf-server/app/tasks/production_tasks.py`, when `imposition_template_id` is set:
- Fetch the row first (cheap), branch on `kind`.
- `template_pdf` → existing `impose_with_template` flow (unchanged).
- `parametric_nup` → call `impose_nup_trimbox(columns, rows, sheet_w, sheet_h, bleed_mm, gutter_mm, crop_mark_offset_mm, crop_mark_length_mm, show_registration, fallback_trim_inset_mm)`.
- `parametric_booklet` → call `booklet_saddle_stitch(sheet_w, sheet_h, bleed_mm, creep_per_sheet_mm)`.

`load_imposition_template` already lives in `app/services/imposition_templates.py` — extend its `ImpositionTemplate` dataclass with the new fields and skip the `template_pdf` download for parametric kinds.

### 3. Admin UI — `PlatformImposition.tsx`

Add a "Kind" radio group at the top of the create/edit dialog:
- **Template PDF** → existing form (PDF upload + slot editor).
- **Parametric N-up** → fields: input size, output size (with paper-size presets), columns, rows, bleed mm, gutter mm, crop-mark offset/length, show registration, fallback trim inset.
- **Parametric Booklet** → fields: input size, output size, bleed mm, creep-per-sheet mm.

Show/hide fields per kind. Existing rows keep their UI.

### 4. Operator picker — `ProductionPanel.tsx`

Right now the Imposition Select shows **all** active templates via `useImpositionTemplates({ activeOnly: true })`. Switch to the per-product whitelist:

- New hook `useTemplatesForProductFamily(productFamilyId)` → reads `product_imposition_defaults` joined to `imposition_templates`, ordered by `is_primary DESC, sort_order ASC`.
- `ProductionPanel` resolves the product family from the job (already in props chain via `bundle.product_family_id`), defaults selection to the `is_primary` template, falls back to first.
- If no templates are assigned for the product family, show "No imposition templates configured for this product — ask an admin." (no free-pick fallback — that's the whole point of Option B).

### 5. Edge function — `production-pdf`

No code changes needed. It already forwards `imposition_template_id` straight to the VPS dispatch endpoint.

## Out of scope

- Per-job overrides on `production_specs` (Option C). All knobs live on the template row.
- New imposition strategies (work-and-turn, perfect-bound signatures).
- Auto-pick-template-for-job (operator always picks; we just narrow the list).

## Verification

After deploy:
1. Create one parametric `1-up A4 cut sheet` template, assign to Bound Documents → operator should see only that, generate imposed PDF identical to print-ready.
2. Create `2-up SRA3 with 5 mm gap + bleed + crop marks`, assign to Bound Documents (alongside #1) → operator picks it, imposed PDF shows two A4s gang-up on SRA3 with marks.
3. Create `Booklet on SRA3 with 0.1 mm creep`, assign to a saddle-stitched product → check signature ordering.

## Files touched

- migration (1 SQL statement — additive)
- `pdf-server/app/services/imposition_templates.py` — extend dataclass + loader
- `pdf-server/app/tasks/production_tasks.py` — branch on `kind`
- `src/hooks/useImpositionTemplates.ts` — add `useTemplatesForProductFamily`, types for new fields
- `src/pages/platform/PlatformImposition.tsx` — kind selector + conditional fields
- `src/components/orders/detail/ProductionPanel.tsx` — restrict picker to assigned templates
