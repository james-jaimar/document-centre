

## Remove "Generate Invoice" button from order detail pages

### Problem
The "Generate Invoice" button on the admin and branch order detail pages allows staff to manually create additional invoices/proformas at any time. Since invoices are already generated automatically when an order is placed, this button creates duplicate, non-real invoice records.

### Changes

**`src/components/orders/OrderInvoicesList.tsx`**
- Remove the `canIssue` prop entirely
- Remove the "Generate Invoice" button from the header
- Remove the "Generate Proforma" button from the empty state
- Remove the `handleIssue` function and `issuing` state
- Keep the list display, View, and Download actions as-is

**`src/pages/admin/AdminOrderDetail.tsx`**
- Remove `canIssue` prop from `<OrderInvoicesList>`

**`src/pages/branch/BranchOrderDetail.tsx`**
- Remove `canIssue` prop from `<OrderInvoicesList>`

### Result
The Invoices & Receipts section becomes read-only -- it lists automatically generated invoices with View/Download actions only. No manual generation possible.

