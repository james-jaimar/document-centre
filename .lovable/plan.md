# Admin-editable product page copy

Make the three information sections on the storefront product page editable per product by the tenant admin, instead of being hard-coded.

## What the customer sees today

On a product page the three collapsible sections are hard-coded:

- **Specifications** — auto-generated from the linked sizes
- **Artwork requirements** — a fixed paragraph about print-ready PDFs and preflight
- **Turnaround & delivery** — assembled from the tenant's turnaround/delivery/collect notes

## What changes

The three sections stay fixed (same three, same order), but for each one the tenant admin can:

- change the **heading** (e.g. "Artwork requirements" -> "File setup")
- write the **body text** (multi-line)
- **hide** the section entirely for that product

If a section is left blank, the current wording is used as the fallback, so nothing changes visually until an admin edits it. Product pages with no saved copy behave exactly as they do now.

## Where it is edited

In **Admin > Products (catalogue)**, each product row gets a new **Copy** button next to the existing Specs / Pricing / Images buttons. It opens a dialog listing the three sections, each with a title field, a body textarea, and a show/hide switch, plus a "Reset to default" per section. Placeholder text in each field shows the default wording so admins know what they are replacing.

## Technical notes

- Storage: a single JSON blob in `tenant_settings` (`category = 'storefront'`, `setting_key = 'product_copy'`), shaped `{ [product_family_id]: { specs: { title, body, enabled }, artwork: {...}, delivery: {...} } }`. No migration needed — existing RLS already allows tenant admins to write and anonymous visitors to read the `storefront` category.
- New hook `src/hooks/useProductCopy.ts` with `useProductCopy(tenantId)` (read + per-family resolver merging defaults) and `useSaveProductCopy(tenantId)`.
- Defaults live next to the hook so the storefront and the editor share one source of truth; the delivery default keeps interpolating `turnaround_note`, `delivery_note` and `collect_note` from the storefront config, and the specs default keeps auto-listing available sizes.
- `src/pages/storefront/StorefrontProduct.tsx`: render the accordion from the resolved copy, skipping disabled sections and hiding the accordion if all three are off.
- New `src/components/admin/TenantProductCopyDialog.tsx`, wired into `src/pages/admin/AdminProductCatalogue.tsx`.
- Scope is limited to these three sections; buttons, field labels and the footer strip stay as they are.
