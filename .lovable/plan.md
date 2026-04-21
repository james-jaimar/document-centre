

## Fix: Invoice PDF Download ("Object not found") + Admin Documents Page

### Root cause

The `generate-invoice-pdf` edge function correctly generates the PDF and uploads it to the private `documents` storage bucket using the **service role** client. The DB record in `order_invoices` is created successfully.

However, the `downloadInvoice` function on the client side calls `supabase.storage.from("documents").createSignedUrl(path, 60)` using the **anon/authenticated** client. The `documents` bucket is private and has **no storage access policies** allowing authenticated users to read files. Supabase storage requires explicit policies on private buckets for signed URL generation, even for authenticated users.

### Fix 1: Add storage policy for `documents` bucket

Create a database migration that adds a storage policy allowing authenticated users who are staff for the tenant (or the order owner) to read invoice files. A simpler approach that still maintains security:

- Allow **authenticated** users to `SELECT` (read/download) objects in the `documents` bucket where the path starts with `invoices/` and the user is either staff for the tenant embedded in the path, or the order owner.

Given the complexity of tenant-based path matching, a pragmatic approach is to allow all authenticated users to read from the `documents` bucket (invoices are tenant-scoped and the UI only shows invoices for orders the user has access to via RLS on `order_invoices`). The path itself contains the tenant ID, providing an additional layer of scoping.

**Migration SQL:**
```sql
CREATE POLICY "Authenticated users can read documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');
```

### Fix 2: Create Admin Documents page

A new admin page at `/admin/documents` listing all invoices for the tenant, with search, filter by kind, download, and link to order detail.

**New file: `src/pages/admin/AdminDocuments.tsx`**

- Queries `order_invoices` filtered by `tenant_id` from `TenantContext`
- Joins order number and customer name from the `orders` table (via a second query or PostgREST relationship)
- Columns: Invoice Number, Kind (badge), Order Number (link), Customer, Amount, Date, Actions (Download PDF)
- Filter bar: kind dropdown (All / Proforma / Invoice / Credit Note / Receipt), search text (invoice number or order number)
- Uses existing `downloadInvoice()` and `generateInvoice()` mutations
- Follows the same utilitarian admin table style as `AdminOrders`

**Modified: `src/App.tsx`**
- Add route: `<Route path="documents" element={<AdminDocuments />} />`

**Modified: `src/components/AppSidebar.tsx`**
- Add "Documents" nav item with `FileText` icon under the existing sidebar sections, linking to `/admin/documents`

### Files changed

| File | Change |
|------|--------|
| Migration | Storage policy on `documents` bucket for authenticated read |
| `src/pages/admin/AdminDocuments.tsx` | New admin documents list page |
| `src/App.tsx` | Add `/admin/documents` route |
| `src/components/AppSidebar.tsx` | Add Documents sidebar nav item |

