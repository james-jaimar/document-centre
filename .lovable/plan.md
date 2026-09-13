# Tenant-to-tenant supplier network

Let one tenant (Impress Print) act as the print supplier for another tenant (The 2027 Edition) inside the same app: linked by invite, priced at locked trade cost, and orders dropping straight into the supplier's tenant as an order against the buyer's company — fully white label to the end customer.

## How it works

### 1. Supplier side (Impress Print)

- New **Suppliers / Trade partners** area in tenant admin.
- On any existing company record (e.g. "The 2027 Edition"), a **Trade partner** action generates a one-time invite code with an expiry.
- A **Wholesale catalogue** screen lists the tenant's product families with an "Offer to trade partners" switch (calendars, deskpads, monthly planners, etc.). Only switched-on families can be picked by buyers.
- Per offered product the supplier confirms which price column applies (the existing trade price ladder) and optional lead time and minimum quantity notes.

### 2. Buyer side (The 2027 Edition)

- Tenant Settings → **Suppliers**: paste the invite code to accept the link. Once accepted, the supplier's offered products become selectable.
- On a product, a new **Fulfilment** control: *Printed in-house* or *Printed by a supplier* → pick partner → pick their matching product.
- When a product is supplier-fulfilled:
  - **Cost is locked** to the supplier's trade ladder, read live, not editable.
  - The buyer types their own **sell price** per quantity break; the screen shows cost, sell, margin and margin %.
  - Changing the supplier's trade price updates the displayed cost and margin; sell prices stay put until the buyer changes them, with a "cost changed" flag.

### 3. Order flow

- Customer orders on The 2027 Edition storefront as normal — no mention of a supplier anywhere customer-facing (storefront, emails, proforma, invoice, tracking).
- On **approval or payment** of the buyer's order, a mirrored order is created in the supplier tenant, against the buyer's company record there, priced at the locked trade cost, carrying the artwork, the specification and the delivery address.
- Statuses flow back one way: supplier progress (In production → Sent to print → Ready/Dispatched) updates a supplier-status field on the buyer's order, which drives the buyer's own customer-facing status. Buyer staff can see the supplier and its progress; the customer cannot.
- Messages stay separate: buyer↔customer messages and buyer↔supplier messages are different threads.

## Technical notes

New tables (all with grants, RLS and updated_at triggers):

- `supplier_links` — `supplier_tenant_id`, `buyer_tenant_id`, `buyer_company_id`, `status` (`invited|active|revoked`), `invite_code`, `invite_expires_at`, `accepted_at`. Readable by members of either tenant; writable only by the owning side of each transition.
- `supplier_offerings` — `supplier_tenant_id`, `product_family_id`, `is_offered`, `lead_time_days`, `min_quantity`, `notes`.
- `product_supplier_assignments` — buyer's `tenant_id` + `product_family_id` → `supplier_link_id`, `supplier_product_family_id`, `is_active`. Unique per buyer product.
- Columns on `orders`: `supplier_order_id`, `source_order_id`, `supplier_link_id`, `supplier_status`, plus an index on `source_order_id`.

Pricing: a `useSupplierCost` hook resolves the supplier tenant's trade rate-card/pack price for the spec through the existing resolution path, bypassing buyer overrides. Buyer sell price stays in the existing pack/override tables; the cost column becomes read-only and supplier-sourced when an assignment exists.

Mirroring: handled in `order-engine` at the approval/payment transition, inside a single idempotent step keyed on `source_order_id` so retries can't duplicate. Artwork is referenced by the existing S3 paths with a supplier-scoped signed read, not copied.

Cross-tenant reads are done by security-definer functions that check an `active` `supplier_links` row, so neither tenant gains general access to the other's data.

## Out of scope for this pass

- Supplier invoicing / statements between the two tenants (the mirrored order carries the trade value; settlement is manual for now).
- Suppliers outside the app (the existing `suppliers` table stays as-is for external outsourcing).
