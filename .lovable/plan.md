

# Product Families & Admin CRUD -- Build Plan

## What we learned from competitors

**Doxzoo** offers ~30 products across 4 categories: Loose Sheets & Posters, Document Binding, Book Printing, Notebooks. **DoxDirect** offers: Unbound Documents, Spiral Bound, Saddle Stitched, Ring Binding, Book Printing (hardback/paperback), Posters. Both use a model where you pick a product, upload a file, then configure options.

## What we already have (schema)

- `product_families` -- name, slug, icon, description, tenant-scoped, sort_order
- `product_options` -- linked to product_family, has option_type, name, values (JSONB array), is_required, sort_order
- `pricing_rules` -- linked to product_family, rule_type, conditions (JSONB), price_value, tenant-scoped
- `document_sections` with section_type enum: body, front_cover, back_cover, insert, tab
- RLS policies already in place for all three tables

The schema is solid. We do NOT need migrations. We need the **Admin UI** and **seed data**.

## Build order

### Phase 1: Admin Products CRUD page
Build the `AdminProducts.tsx` page with full CRUD for product families and their options.

**Product families list view:**
- Table showing name, slug, icon, active status, option count
- Create / Edit / Delete actions
- Drag-to-reorder (or sort_order arrows)

**Product family form (dialog):**
- Fields: name, slug (auto-generated from name), description, icon (dropdown of lucide icon names), is_active
- tenant_id auto-set from user's profile

**Product options sub-panel:**
- When editing a product family, show its options in an expandable section
- Each option: name, option_type (select/radio/checkbox/number), values (JSONB editor -- tag-style input for adding values), is_required, sort_order
- Add / Edit / Remove options inline

### Phase 2: Seed default product families
Insert starter data via the admin UI (no migration needed). The initial product families to create:

| Product Family | Slug | Description |
|---|---|---|
| Loose Sheets | `loose-sheets` | Unbound printed pages, flyers, handouts |
| Stapled Documents | `stapled-documents` | Corner or side-stapled document sets |
| Wire Bound Documents | `wire-bound` | Wire/spiral bound presentations & reports |
| Comb Bound Documents | `comb-bound` | Comb bound manuals & reports |
| Ring Binder Documents | `ring-binder` | Ring binder with printed & punched pages |
| Saddle Stitched Booklets | `saddle-stitched` | Folded & stapled booklets/brochures |
| Perfect Bound Books | `perfect-bound` | Glued spine paperback books |
| Posters & Plan Prints | `posters` | Large format single-sheet prints |

### Phase 3: Product options per family
Each product family gets configurable options. Common options shared across most families:

- **Paper Stock** (select): e.g. "80gsm Bond", "100gsm Uncoated", "120gsm Silk", "160gsm Silk", "250gsm Silk"
- **Colour Mode** (select): "Colour", "Black & White", "Mixed" (per-section control)
- **Print Sides** (select): "Single Sided", "Double Sided"
- **Quantity** (number): min 1

Family-specific options:
- **Wire/Comb/Ring Bound**: Cover type (No Cover, Clear Acetate Front, Card Front & Back, Printed Cover), Cover colour, Back cover colour
- **Saddle Stitched**: Cover stock (same as body, heavier card), Self-cover or separate cover
- **Perfect Bound**: Cover stock, Cover lamination (None, Gloss, Matt)
- **Ring Binder**: Binder size (25mm, 40mm, 50mm, 65mm), Binder colour, Tab dividers (yes/no), Number of tabs
- **Posters**: Size (A3, A2, A1, A0), Lamination (None, Gloss, Matt, Encapsulated)

### Phase 4: Admin Pricing CRUD page
Build `AdminPricing.tsx` with CRUD for pricing rules linked to product families.

**Pricing rule form:**
- Name, product_family (dropdown), rule_type (per_page, per_document, per_unit, surcharge, setup_fee)
- price_value (decimal)
- conditions (JSONB) -- structured editor for: min_pages, max_pages, is_color (true/false), paper_stock, min_quantity, max_quantity
- is_active, sort_order

The pricing engine evaluates rules in sort_order, matching conditions against the order item spec. Multiple rules can apply (e.g. base per-page + colour surcharge + cover surcharge).

## Technical details

**Files to create/modify:**

1. `src/pages/admin/AdminProducts.tsx` -- Full rewrite with CRUD UI
2. `src/components/admin/ProductFamilyForm.tsx` -- Dialog form for create/edit
3. `src/components/admin/ProductOptionsEditor.tsx` -- Inline options management
4. `src/hooks/useProductFamilies.ts` -- React Query hooks for CRUD operations
5. `src/hooks/useProductOptions.ts` -- React Query hooks for options CRUD
6. `src/pages/admin/AdminPricing.tsx` -- Full rewrite with CRUD UI
7. `src/components/admin/PricingRuleForm.tsx` -- Dialog form for pricing rules
8. `src/hooks/usePricingRules.ts` -- React Query hooks for pricing CRUD

**No database migrations needed** -- all tables and RLS policies already exist.

**UI components used:** Dialog, Form (react-hook-form), Input, Select, Switch, Table, Badge, Button -- all already in the project.

**Pattern:** Each CRUD page follows: list view with table + action buttons, dialog for create/edit, confirm dialog for delete, toast notifications for success/error.

