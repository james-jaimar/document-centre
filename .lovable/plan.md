
# Imposition Templates — Build Plan

## Goal
Give platform admins a library of imposition templates (uploaded PDFs + slot definitions). Each product can declare a **default template per output paper**. Operators see a "Print size → Output size" picker on the Impose step and can override before generating the imposed PDF.

This round covers everything **except booklets / saddle-stitched** (page reordering needs its own engine — deferred).

---

## 1. Data model (Supabase migration)

### `imposition_templates` (platform-owned)
| field | notes |
|---|---|
| `id`, `created_at`, `updated_at` | standard |
| `name` | e.g. "A4 → SRA3 — 2-up, double cut, bleed + crops" |
| `description` | free text |
| `input_size` | enum slug: `A6`, `A5`, `A4`, `A3`, `BC`, `DL`, `custom` |
| `input_width_mm`, `input_height_mm` | numeric (for `custom`) |
| `output_size` | `A4`, `A3`, `SRA3`, `B2`, `custom` |
| `output_width_mm`, `output_height_mm` | numeric |
| `n_up` | integer (1, 2, 4, 8…) |
| `has_bleed` | boolean |
| `has_crop_marks` | boolean |
| `work_style` | `cut_sheet` \| `work_and_turn` \| `sheetwise` |
| `template_pdf_path` | storage key in `assets` bucket |
| `slots` | jsonb: `[{index, x_mm, y_mm, width_mm, height_mm, rotation_deg}]` — coordinates from bottom-left of output sheet |
| `is_active`, `sort_order` | |

RLS: read = anyone authenticated; write = `has_role(auth.uid(),'platform_admin')`.

### `product_imposition_defaults`
Maps a `product_family` (or product) to one or more templates, with a `is_primary` flag per template.
| field | notes |
|---|---|
| `product_family_id` | fk |
| `imposition_template_id` | fk |
| `is_primary` | boolean — exactly one true per family enforced by partial unique index |
| `sort_order` | for the operator picker |

RLS: same as above (platform-owned).

### `order_jobs` additions
Add columns:
- `imposition_template_id uuid null` — operator's choice (or default at impose time)
- `imposition_n_up int null` — convenience copy
- `imposed_pdf_path text` already exists.

### Storage
New bucket: **`imposition-templates`** (private). Platform admins read/write; service-role reads from pdf-server.

---

## 2. Platform admin UI

New page: **`/platform/imposition`** (linked from Platform sidebar under "Production").

- List of all templates: name, input → output, n-up, bleed, work style, active toggle.
- Create / edit modal:
  - Metadata fields (name, sizes, n-up, bleed, crops, work style).
  - **PDF upload** (the press sheet template — gripper marks, colour bars, registration, slot guides).
  - **Slot editor**: visual canvas showing the uploaded PDF as background, admin draws/positions N rectangles representing where customer pages are stamped. Each rect editable (x/y/w/h/rotation in mm). Live preview of a sample A4 stamped into each slot.
  - Save → uploads PDF, writes row.
- Soft delete via `is_active=false`.

New page: **`/platform/products/:id/imposition`** (or a tab on the existing product editor) — assign templates to product families, mark one primary per family.

---

## 3. Operator UI (`ProductionPanel`)

Replace the current single "Impose" button with a small **Imposition** sub-section:

```text
Print size: A4   →   Output:  [ A4 cut sheet         ▼ ]   [ Impose ]
                              · A4 cut sheet (default)
                              · A3 — 2-up, no bleed
                              · SRA3 — 2-up, bleed + crops
```

- Dropdown is populated from `product_imposition_defaults` filtered by the job's input size.
- Default selection = `is_primary` row.
- "Impose" calls `production-pdf` with `{ action: 'impose', job_id, imposition_template_id }`.
- After completion, shows the imposed PDF link as today.

---

## 4. pdf-server changes

`/v1/operations/assemble-imposed-sheet` currently a stub — replace with real implementation:

1. Look up `order_jobs` → get `print_ready_pdf_path` and `imposition_template_id` (passed from edge fn).
2. Fetch template row → download `template_pdf_path` and read `slots` JSON.
3. Open print-ready PDF with `pikepdf`. For each customer page:
   - Group into chunks of `n_up`.
   - For each chunk: clone the template page, then **stamp** each customer page onto the slot rectangle (scale to fit, rotate per slot).
   - If `has_crop_marks` and template doesn't already include them, the template PDF is the source of truth — admin draws marks into the template artwork itself. (No procedural mark generation in this round; keeps slot-editor simple.)
4. Write composite PDF, upload to `documents/imposed/{job_id}.pdf`, update `order_jobs.imposed_pdf_path` and `imposition_template_id`/`imposition_n_up`.

Library: `pikepdf` (already in requirements.txt) — use `Page.add_overlay` with a transformation matrix for placement + rotation.

Edge fn `production-pdf` change: forward `imposition_template_id` from request body to the pdf-server payload.

---

## 5. Hard size enforcement (your point #3)

Out of scope for this round — you said you'd double-check it. Once you confirm, we can:
- Add `allowed_sizes jsonb` to `product_families` (already partly done via `product_options` — needs audit).
- Block configurator from offering sizes the family can't produce.

I'll flag this as a follow-up after you've reviewed.

---

## 6. Verification checklist
- Platform admin can create "A4 → SRA3 — 2-up bleed/crops" template, upload artwork PDF, draw 2 slots.
- Bound document product family lists three templates; one marked primary.
- Operator on a bound-doc job sees dropdown defaulted to primary; can switch.
- Click Impose → pdf-server stamps body pages 2-up onto SRA3 sheets → imposed PDF opens, slots correctly placed, crop marks visible.
- Switching template and re-imposing replaces the file.
- Non-platform users get 403 on template CRUD.

---

## 7. Out of scope (next rounds)
- Booklets (saddle-stitched) — needs page-order shuffling (1+last on one sheet, 2+second-last, etc.).
- Auto-pick template from branch press capability.
- Procedural crop-mark/colour-bar generation.
- Tenant-specific template overrides.
- Hard size enforcement audit.
