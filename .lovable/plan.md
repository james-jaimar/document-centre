

## Expand Documents Tab: Printable Document Settings

Based on the reference screenshot, the Documents settings tab needs to be significantly expanded to match the full configurability of the emulated system.

### What gets built

The existing `DocumentsTab` component will be rebuilt to include all the settings shown in the reference, organized into clear card sections. All values will be stored in the `tenant_settings` table under the `"documents"` category using the existing `useBulkUpsertTenantSettings` hook. No database schema changes are needed.

### Settings to add

**Card 1: Header Name or Logo**
- Radio toggle: "Name" or "Logo"
- Text input for header name (when "Name" is selected)
- Logo preview + file upload button (when "Logo" is selected; uploads to the `assets` bucket under the tenant path)
- Settings keys: `header_mode` ("name" | "logo"), `header_name`, `header_logo_url`

**Card 2: Invoice Address**
- Textarea for the sender/company address block that appears on invoices
- Description: "Your company address displayed on invoices and proformas"
- Setting key: `invoice_address`

**Card 3: Document Titles**
- Proforma Invoice Title (input, default empty = "PROFORMA INVOICE")
- Invoice Title (input, e.g. "Vat # 4890102587", default empty = "TAX INVOICE")
- Setting keys: `proforma_title`, `invoice_title`

**Card 4: Footer** (replaces the existing Legal Footer card)
- Larger textarea (6 rows) for full footer content including banking details, payment instructions, etc.
- Setting key: `legal_footer_text` (reuse existing key)

**Card 5: Document Numbering** (existing, kept as-is)
- Proforma Prefix, Delivery Note Prefix

**Card 6: Jobsheet/Ordersheet Custom Fields**
- 5 text inputs for custom field labels (e.g. Date, Print Name, Signature)
- Setting key: `jobsheet_custom_fields` (stored as JSON array of strings)

**Card 7: Delivery Note Custom Fields**
- 5 text inputs for custom field labels (e.g. Date, Picked By, No. of Boxes, Print Name, Signature)
- Setting key: `delivery_note_custom_fields` (stored as JSON array)

**Card 8: Invoice Custom Fields**
- 5 text inputs for custom field labels (e.g. "vat no.")
- Setting key: `invoice_custom_fields` (stored as JSON array)

### Layout
- Main column (left, wider): Header/Logo, Invoice Address, Document Titles, Footer, Document Numbering
- Side column (right, narrower): Jobsheet Custom Fields, Delivery Note Custom Fields, Invoice Custom Fields
- On mobile: single column, side cards stack below

### Wire up to PDF generation
Update `supabase/functions/generate-invoice-pdf/index.ts` to read the new `documents` category settings and apply them:
- Use `header_mode` / `header_name` / `header_logo_url` for the PDF header (embed logo image if mode is "logo")
- Use `invoice_title` / `proforma_title` for the document type heading instead of hardcoded strings
- Use `invoice_address` for the "From" block instead of constructing it from tenant fields
- Use `invoice_custom_fields` to render additional labeled fields on the invoice
- Footer text already wired via `legal_footer_text`

### Files changed

| File | Change |
|------|--------|
| `src/pages/admin/settings/DocumentsTab.tsx` | Rebuild with all new settings cards, two-column layout, logo upload |
| `supabase/functions/generate-invoice-pdf/index.ts` | Read and apply new document settings (titles, address, header mode, custom fields) |

### Technical notes
- Logo upload uses `supabase.storage.from("assets").upload(...)` with tenant-scoped path
- Custom fields stored as JSON arrays in `tenant_settings.setting_value` (JSONB column)
- All settings use `value_type: "string"` or `value_type: "json"` as appropriate
- No new database tables or migrations required

