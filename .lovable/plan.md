
## Branch Reports & Financial Exports

Add a **Reports** tab to the Branch admin so franchise owners can pull financials to re-key into their PostNet head-office system. Manager-only, cash-basis (revenue = when paid), exportable to Excel and PDF.

### 1. New page & navigation
- New route `/t/:slug/branch/:branchSlug/reports` → `src/pages/branch/Reports.tsx`.
- Add "Reports" entry to `BranchSidebar.tsx`, gated identically to Settings/Users/Billing via `useBranchPermissions` (manager only). Operators don't see the link; direct nav shows the "Manager access required" lock screen.

### 2. Report screen UX
Single page, three controls at top:
- **Date range** picker (presets: Today, Yesterday, This week, Last week, This month, Last month, This quarter, Custom). Defaults to "This month".
- **Report type** tabs: Sales Summary · Detailed Sales · Payments / Cash-up · VAT.
- **Export** buttons: `Download Excel` and `Download PDF` (always visible, export whatever's on screen).

Each tab renders a server-computed table + a few KPI tiles (gross, discounts, refunds, net, VAT, order count) so the manager can sanity-check before exporting.

### 3. Revenue definition (cash basis)
An order counts toward a report when **payment was received** in the selected date range:
- For online gateways (Stripe/PayFast): use the `payments` row with `status = 'succeeded'` and its `paid_at` timestamp.
- For EFT / Cash on collection: use the `orders.paid_at` (or the timeline event where status moved to `paid`) as the cash-received marker.
- Refunds are reported in the period the refund was processed (`payments.status = 'refunded'` or refund row's `processed_at`), shown as a negative line — never netted into the original order's period.

### 4. The four reports

**a. Sales Summary**
Grouped by day (or week/month for long ranges). Columns: Date · Orders · Gross · Discounts · Refunds · Net (ex VAT) · VAT · Total (inc VAT). Footer row totals the period.

**b. Detailed Sales (line items)**
One row per `order_items` row in scope. Columns: Paid date · Invoice # · Order # · Customer · Product · Qty · Unit (ex VAT) · Line discount · Line net · VAT · Line total. This is the file they'll import.

**c. Payments / Cash-up**
Grouped by gateway. Columns: Gateway (Stripe / PayFast / EFT / Cash on collection) · # Transactions · Gross received · Refunds · Net received. Plus a per-day breakdown table below for daily cash-up.

**d. VAT Report**
Period totals split into: Standard-rated sales (ex VAT), Output VAT (15%), Zero-rated sales, Total inc VAT. Includes inclusive/exclusive flag per branch. Designed to map onto SARS VAT201 fields, not auto-submitted.

### 5. Backend
New Edge Function `branch-financial-reports` (`supabase/functions/branch-financial-reports/index.ts`):
- Auth: `supabase.auth.getUser()` + verify caller has `branch_manager` role for the requested `branch_id` (reuse the pattern from `manage-user`).
- Input: `{ branch_id, report_type, date_from, date_to, group_by? }`.
- Uses service role to query `orders`, `order_items`, `payments`, `order_adjustments`, `order_invoices`, `branch_settings`/`tenant_settings` (for tax config).
- Returns normalized JSON: `{ kpis, rows, meta: { currency, tax_rate, tax_inclusive, branch_name, period } }`.
- Strict tenant/branch filtering — never trusts the client `branch_id` without role check.

### 6. Exports
- **Excel**: `exceljs` (already client-friendly) or generate server-side in the Edge Function via a second action `format=xlsx` and stream the bytes back. Preferred: client-side using the JSON already fetched, so we don't pay double round-trips. New helper `src/lib/reports/exportExcel.ts` produces a workbook with one sheet per visible table, formatted headers, currency formatting (`R #,##0.00`), and a frozen header row.
- **PDF**: reuse the invoice PDF infrastructure pattern — new Edge Function action or a thin wrapper around the existing PDF stack (`generate-invoice-pdf` style) that takes the report JSON and renders a branded A4 PDF with branch logo, period, KPI cards, and the table. New file `supabase/functions/generate-report-pdf/index.ts`.
- Filenames: `{branch-slug}-{report-type}-{YYYYMMDD}-{YYYYMMDD}.{xlsx|pdf}`.

### 7. Frontend files
```text
src/pages/branch/Reports.tsx                    new — page shell, tabs, date picker, export buttons
src/components/branch/reports/
  SalesSummaryTable.tsx                         new
  DetailedSalesTable.tsx                        new
  PaymentsCashupTable.tsx                       new
  VatReportTable.tsx                            new
  ReportKpiTiles.tsx                            new
  ReportDateRangePicker.tsx                     new (presets + custom)
src/hooks/useBranchFinancialReport.ts           new — wraps the edge function call
src/lib/reports/exportExcel.ts                  new — exceljs workbook builder
src/lib/reports/exportPdf.ts                    new — calls generate-report-pdf
src/components/BranchSidebar.tsx                edit — add Reports nav entry
src/lib/auth/branchPermissions.ts               edit — add `canViewReports` (manager only)
src/App.tsx (or branch routes file)             edit — register /reports route
```

### 8. Backend files
```text
supabase/functions/branch-financial-reports/index.ts   new — compute reports
supabase/functions/generate-report-pdf/index.ts        new — render PDF
```
No schema migrations needed — every field is already on `orders`, `order_items`, `payments`, `order_adjustments`, `branch_settings`, `tenant_settings`.

### 9. Out of scope (call out, don't build)
- Auto-submission to SARS eFiling.
- Direct API push into PostNet head-office systems (we don't have an endpoint).
- Per-product profitability / COGS reporting (no cost data captured yet).
- Scheduled email-out of reports — can be a follow-up once the manual export is proven.
