# Admin fixes: artwork preview, ticket queueing, VAT, company creation

Four separate issues from the deskpad order test. Each is scoped below with what was verified.

## 1. Admin can't see the artwork preview (a)

Verified: the deskpad job (`a2deskpad`, order INV-00136) stores everything needed under
`order_jobs.configuration.templated_artwork` — template id, base PDF path, trim size, bleed,
placeholder definitions (x/y/size/layer/opacity/z-index) and the customer's filled values
(image storage paths, text). The admin job panel only has galleries for Canvas Prints and
Photo Prints, so artwork jobs fall through to a plain file list.

Build a **Templated artwork admin proof** block in the job detail panel that renders the exact
same composite the customer approved, reusing the existing client-side renderer
(`src/lib/artworkTemplates/renderTemplate.ts` + the proof modal), with a click-to-enlarge full
proof view. Covers both templated and uploaded-artwork (supplied) jobs.

## 2. Job ticket generation competes with print-ready assembly (b)

Verified: `/v1/operations/render-job-ticket` enqueues `render_job_ticket_for_job` on the
**`documents`** Celery queue — the same queue the print-ready assembly runs on, and workers run
one task at a time. So asking for a ticket while a print-ready PDF is being assembled makes the
big job wait behind (or alongside) the small one.

- Move job-ticket rendering onto its own light queue so it can never sit in front of assembly.
- Make the admin action fire-and-poll: the button enqueues, shows "Queued…", and the row updates
  when the ticket path appears, instead of holding the request open.
- Note: the Download button itself only signs a URL; it does not cancel anything. Once the
  queues are separated I'll re-check the worker logs to confirm nothing else interrupts assembly.

## 3. Invoice shows no VAT (c)

Verified: the Impress tenant (and its branch) has **zero rows** in `tenant_settings` /
`branch_settings` for the `financial` category. With no `tax_rate`/`tax_enabled`, the order
engine correctly computes `vat_amount = 0` — but the invoice PDF falls back to a hard-coded
`15` for the *label*, so it prints "VAT (15.00%) R 0.00" and an exclusive subtotal equal to the
total. The data is consistent; the config is missing and the PDF lies about the rate.

- Set the financial settings for the Impress tenant (15% VAT, exclusive) so new orders price
  correctly, and recompute totals on the affected open order(s).
- Fix the invoice renderer so the VAT row uses the *actual* resolved rate — and when tax is not
  configured, omit the VAT row entirely rather than printing a false 15%.
- Surface tax rate / inclusive / label in the tenant and branch financial settings screen so
  this can't be missed on a new tenant.

## 4. Cannot create a company (d)

Verified root cause: `customer_companies` RLS uses
`user_is_staff_for_branch(app_id, tenant_id, branch_id)`. The Impress admin's membership row is
**branch-scoped** (`branch_id = 50040317…`), and the New Company form inserts with
`branch_id = null` for tenant-wide companies. The policy only passes when the membership is
tenant-wide (`tm.branch_id IS NULL`) or the branch ids match — so a branch-scoped admin is
blocked from creating a tenant-wide company.

Fix with a migration that lets branch-scoped staff manage tenant-wide companies within their own
tenant (a `branch_id IS NULL` company is visible/manageable by any active staff member of that
tenant), keeping branch-scoped companies restricted to that branch. Cross-tenant isolation is
unchanged.

## Technical notes

- Files: `src/components/orders/detail/JobDetailPanel.tsx` (+ new
  `TemplatedArtworkAdminProof.tsx`), `src/components/orders/detail/ProductionPanel.tsx`,
  `src/hooks/useProductionArtefacts.ts`, `pdf-server/app/web/routes.py`,
  `pdf-server/app/worker.py`, `supabase/functions/generate-invoice-pdf/index.ts`.
- One migration for the `customer_companies` staff policy; one data update for the Impress
  financial settings and the affected order totals.
