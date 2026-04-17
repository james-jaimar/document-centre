

# Plan: Make this a real ecommerce system

Three problems, one direction. I'll fix the immediate blockers now and lay out a clear roadmap to a "fully fledged" ecommerce platform.

---

## Part 1 — Immediate fixes (this round)

### Fix A: Admin Order Manager hides unpaid orders
**Cause:** the status filter chips default to admin statuses like `new_order`, `under_review`, `in_production` etc. INV-00011 has `admin_status='in_production'` AND `payment_status='unpaid'`, but on PostNet the user actually has 0 orders. The deeper issue is the status chip row hides unpaid items behind tabs and there's no "Unpaid / Awaiting Payment" lens.

**Fix:**
- Add a top-row "Payment" filter alongside admin-status: `All / Unpaid / Part Paid / Paid / Refunded`.
- Show a per-row Payment badge (already have icon, add color label).
- Change empty state to: `No orders match these filters. {N} total orders for {tenant_name}` with a "Clear filters" button.
- Add a "Mark as Paid" quick action on the order detail page (admin) — calls order-engine `record_payment` op (already exists). Also a "Record Manual Payment" dialog for cash/EFT.

### Fix B: Customer "My Orders" looks confusing (mixes drafts + placed)
**Cause:** drafts and placed orders are visually identical rows. INV-00011 sits between two drafts with the same styling.

**Fix — split into two distinct surfaces:**

```text
┌─ My Orders ──────────────────────────────────────────┐
│  [Placed Orders]  [Drafts (2)]   ← top tabs           │
├──────────────────────────────────────────────────────┤
│  PLACED tab (default):                                │
│    Card-style rows, prominent order #, status pill,  │
│    total, item thumbnails, "View order" CTA          │
│                                                       │
│  DRAFTS tab:                                          │
│    Lighter "in progress" cards, "Resume" CTA,        │
│    "Delete" action, dimmed styling                   │
└──────────────────────────────────────────────────────┘
```

- Placed orders never appear in Drafts and vice versa.
- Drafts get a subtle "Draft – not yet placed" ribbon and a different background tint.
- Placed orders show: order #, date, total, item count, status badge, payment badge, and a thumbnail strip of the first 1–3 jobs.
- Empty state for Placed: "No orders yet — start by uploading a file."

### Fix C: Customer order detail is bare
Right now it shows: items (name + qty + price), payment summary, messages. Missing: full print spec, finishing, paper, sections, delivery / collection details, files, proof status, downloadable invoice.

**Fix — restructure CustomerOrderDetail into a richer layout:**

```text
┌─ Order INV-00011 ─── Status pill ── Payment pill ────┐
│                                                       │
│ ┌─ Items ────────────────────────────────────────┐    │
│ │ [thumb] Booklets — A5 Wedding Booklets          │    │
│ │   Qty: 10 copies                R 610.00        │    │
│ │   ─────────────────────────────────────         │    │
│ │   Print Specs                                   │    │
│ │     Size: A5  •  Pages: 24  •  Colour: Full     │    │
│ │     Paper: 170gsm Silk  •  Sides: Duplex        │    │
│ │   Finishing                                     │    │
│ │     Binding: Saddle stitched                    │    │
│ │     Lamination: Matt (cover only)               │    │
│ │   Sections (if bound):                          │    │
│ │     • Cover — 170gsm Silk, Matt Lam             │    │
│ │     • Body  — 100gsm Bond, B/W Duplex           │    │
│ │   Files                                         │    │
│ │     • wedding-booklet.pdf (24 pages)            │    │
│ │   [View files]  [Download proof]                │    │
│ └────────────────────────────────────────────────┘    │
│                                                       │
│ ┌─ Fulfilment ──────────────────────────────────┐     │
│ │ Method: Delivery  •  Required by 25 Apr 2026  │     │
│ │ Ship to:  Wendy Jaimar                        │     │
│ │           12 Acacia Rd, Sandton, 2196          │     │
│ │ Tracking: not yet dispatched                   │     │
│ └────────────────────────────────────────────────┘    │
│                                                       │
│ ┌─ Payment Summary ─────────────────────────────┐     │
│ │ Subtotal R 610  VAT R 91.50  Total R 701.50   │     │
│ │ Amount Due: R 701.50                           │     │
│ │ [Pay Now]   [Download invoice (PDF)]           │     │
│ └────────────────────────────────────────────────┘    │
│                                                       │
│ Sidebar: Messages + Timeline (existing, unchanged)    │
└──────────────────────────────────────────────────────┘
```

The print specs are read from `order_jobs.configuration.summary` and `configuration.sections` (already snapshotted). Files are read from `order_documents` filtered by `is_customer_visible=true`.

**Pay Now** opens a payment dialog stub for now (so the UX is in place when we wire EFT/Stripe later).

---

## Part 2 — Roadmap to a fully fledged ecommerce system

Below is a prioritised gap analysis. Items marked **[Now]** are part of this round; **[Next]** are short follow-ups; **[Later]** are bigger pieces of work I'll plan separately when you green-light each.

### 1. Catalog & merchandising
- [Later] Product family landing pages with imagery, copy, starting prices, FAQs.
- [Later] Quote-to-order flow for non-standard jobs (bespoke quoting).
- [Later] Promo codes / discount engine.
- [Later] Reorder and "Save as template" from a placed order.

### 2. Cart & checkout
- [Now] Already wired through engine.
- [Next] Address book on the profile (saved delivery & billing addresses).
- [Next] VAT-inclusive vs exclusive display preference per tenant.
- [Later] Multiple delivery addresses per order (split shipping).
- [Later] Tax rules per region (currently flat 15% ZA).

### 3. Payments
- [Now] Manual "Mark as Paid" + "Record Manual Payment" for admin (covers EFT today).
- [Next] Customer-side "Pay Now" button → opens dialog (Stripe/Payfast/Yoco placeholder).
- [Later] Real PSP integration (Stripe + Payfast for ZA).
- [Later] Invoices (PDF) and receipts emailed automatically.
- [Later] Refunds & credit notes.

### 4. Order lifecycle visibility
- [Now] Customer order detail shows full specs, files, fulfilment, payment.
- [Next] Public status page reachable by token (for non-account guests).
- [Later] Email + SMS notifications on every status transition (driven by `status_history`).
- [Later] Customer proof approval flow (job_proofs table is already there).

### 5. Admin operations
- [Now] Payment filter + Mark Paid action.
- [Next] Bulk actions on order grid (mark printed, assign to operator, change status).
- [Next] Production queue grouped by job_status for the workshop.
- [Later] Per-tenant workflow templates (proof required vs not, prepaid vs account).
- [Later] Supplier dispatch / outsourcing flows (`assigned_supplier_id` already exists).
- [Later] Revenue dashboard, AR aging, top customers.

### 6. Customer accounts
- [Now] Hidden behind portal already.
- [Next] Address book + saved payment methods.
- [Later] Company / multi-user accounts with per-user PO numbers and approval workflow.
- [Later] Account credit / pre-paid wallets.

### 7. Files & documents
- [Next] On the customer order detail, list files from `order_documents` with download links.
- [Later] Migrate cart documents into `order_documents` at placement (fixes the orphaned-S3 issue flagged earlier).
- [Later] Customer can re-upload corrected files for a job in `awaiting_files` state.

### 8. Notifications & comms
- [Later] Templated transactional emails: order received, payment received, in production, ready/dispatched, completed.
- [Later] Per-tenant branding on emails (logos, colors already in `tenant_settings`).

### 9. Trust, legal, branding
- [Later] T&Cs acceptance at checkout, stored against the order.
- [Later] Branded invoice/quote PDF generator per tenant.
- [Later] Storefront SEO (meta tags, OG images per product family).

### 10. Analytics
- [Later] Funnel: view product → upload file → add to cart → checkout → pay.
- [Later] Per-tenant dashboards.

---

## Files I'll touch in this round

**Admin:**
- `src/pages/admin/AdminOrders.tsx` — add Payment filter chips, payment column, smarter empty state.
- `src/pages/admin/AdminOrderDetail.tsx` — add "Mark as Paid" + "Record Manual Payment" dialog (calls existing engine `record_payment` op).
- `src/components/orders/OrderStatusChips.tsx` — small reuse for payment chips, or a sibling component.

**Customer:**
- `src/pages/dashboard/CustomerOrders.tsx` — replace tabs with `[Placed Orders] [Drafts]` and apply card styling per category.
- `src/pages/dashboard/CustomerOrderDetail.tsx` — restructure into Items (with full spec block, sections, files), Fulfilment, Payment Summary (with Pay Now + Download Invoice stubs), keep Messages sidebar.
- `src/lib/orders/queries.ts` — extend `fetchOrderDetail` to also pull `order_documents` (already does) and ensure `configuration.summary`/`configuration.sections` come through (they already do — they're inside `order_jobs.configuration`).

**No DB or edge function changes required for this round.** The engine and snapshots already carry everything we need.

## Verification
1. PostNet admin: Order Manager shows the 0 orders correctly with new empty-state copy; switch to Printworks → INV-00011 visible with Unpaid badge; Mark as Paid works and the customer view updates to "In Production".
2. Customer My Orders: Drafts and Placed Orders are visually distinct in two tabs; placed orders no longer mix with drafts.
3. Customer Order INV-00011: shows full spec (size, pages, paper, finishing, sections), fulfilment (delivery/collection), payment summary with Pay Now and invoice buttons, plus the existing messages sidebar.

