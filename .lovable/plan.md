

# Roadmap: Take the platform from "works" to "fully fledged ecommerce"

Sequenced so each layer unlocks the next. I'll need a few decisions before kicking off Phase 1.

---

## Phase 1 — Payments (per tenant)

Everything else (emails, invoices, refunds) hangs off this.

- **Stripe Connect (Standard accounts)** so each tenant receives their own funds directly.
- New table `tenant_payment_accounts`: `tenant_id`, `provider`, `stripe_account_id`, `charges_enabled`, `payouts_enabled`, `onboarding_url`, `livemode`.
- New tab in **Tenant Settings → Payments**: "Connect Stripe" button → onboarding link → live status pills. Manual/EFT toggle + bank details captured for invoice footer.
- Customer "Pay Now" → edge function `create-payment-intent` (uses tenant's connected account, `transfer_data[destination]`) → Stripe Elements drawer.
- Edge function `stripe-webhook` (signature verified) → handles `payment_intent.succeeded` / `.payment_failed` / `charge.refunded` → calls existing `recordPaymentEvent` → DB triggers already roll up `payment_status` and `customer_status`.
- Admin "Refund" action on order detail.
- Manual "Mark as Paid" already wired — keep.

## Phase 2 — Invoice & receipt PDFs (per-tenant branded)

- New edge function `generate-invoice-pdf` using `pdf-lib`, rendering from order snapshot + tenant branding (logo, legal name, VAT no., address, bank details).
- New table `order_invoices` (`invoice_number` from `number_sequences` type=`invoice`, `pdf_path`, `kind`: invoice / credit_note / receipt).
- Auto-generate proforma at placement, tax invoice on payment, credit note on refund.
- "Download Invoice" on customer + admin order detail.

## Phase 3 — Transactional email lifecycle

- Templates per event: `order-received`, `payment-received`, `proof-ready`, `in-production`, `ready-for-collection`, `dispatched`, `completed`, `refunded`.
- Triggered from order-engine after each `status_history` insert (single hook).
- Each tenant's emails branded with their logo / colors / from-name.
- Per-event toggle in Settings → Notifications (tab already exists).

## Phase 4 — Customer accounts polish

- **Address book** (`customer_addresses` table) with default delivery/billing flags. Profile page CRUD; checkout picker.
- **Reorder** button on placed order → clones `order_jobs.configuration` snapshots into a fresh draft cart.
- **Save as template** → `customer_order_templates`.

## Phase 5 — Admin operations

- **Bulk actions** on AdminOrders grid (status changes, mark paid, assign).
- **Production queue** (`/admin/production`) — kanban grouped by `job_status`, drag between columns, assign to operator.
- **Customers page** — list of tenant's customers from `tenant_memberships`, with order count, lifetime value, last order, drill-in.

## Phase 6 — Trust & legal

- T&Cs checkbox at checkout; record `terms_accepted_at` + `terms_version` on the order.
- Per-tenant T&Cs body in Settings → General (rich text).
- Branded quote PDF (variant of invoice generator).

## Phase 7 — Analytics

- **Tenant dashboard widgets:** revenue (MTD vs prior), orders by status (donut), AR aging buckets, top 10 customers, top products.
- **Funnel** (later): `analytics_events` log → cohort chart for view → upload → cart → checkout → paid.
- **Platform dashboard:** GMV across all tenants, active tenants, total orders.

---

## Suggested execution order

```text
1  Payments (Stripe Connect + EFT)
2  Invoice & receipt PDFs
3  Transactional emails
4  Address book + Reorder + Templates
5  Bulk admin actions + Production queue + Customers page
6  T&Cs + branded PDFs polish
7  Analytics dashboards
```

I'd ship **Phases 1+2+3 as one big release** — "Order it → Pay it → Get the invoice → Get the email" forms one continuous customer story. Phases 4–7 then go one at a time.

---

## Decisions I need before starting Phase 1

1. **Payments model** — Stripe Connect per tenant (recommended), single platform Stripe account, or manual/EFT only for now?
2. **Email provider** — switch to Lovable's built-in queued email infra (recommended; gives retries, suppression, branded per-tenant) or keep your existing custom SMTP `send-email` function?
3. **Invoice numbering** — separate per-tenant invoice sequence (`INV-2026-0001`, accountant-friendly) or reuse the order number?
4. **Phase 1 scope** — ship 1+2+3 together as one big release, or just Phase 1 first and verify before continuing?

Reply with your picks (or "use your recommendations") and I'll kick off the implementation.

