# Checkout: Branch Lock-in + EFT/Pro Forma + PayFast

Three connected changes to `src/pages/dashboard/Checkout.tsx` and supporting pieces. No database schema changes required — `tenant_memberships` already carries `branch_id`, and `generate-invoice-pdf` already supports `kind = "proforma"`.

---

## 1. Lock collection branch to the active storefront branch

Today the checkout shows a generic "Select a branch…" dropdown listing every active branch in the tenant. We'll replace this with the **current storefront branch, pre-selected and locked**, plus an escape hatch.

Behaviour:
- Read `activeBranch` from `useBranch()` and set it as the default + only displayed option.
- Show as a read-only card: "Collect from: **PostNet Sandton City** — Sandton" with a small "Change branch" link.
- Clicking **Change branch** opens a confirmation modal explaining:
  - Prices, stock and lead times may differ at other branches.
  - Their cart will be re-priced against the new branch's rate card.
  - Their customer account is registered against the current branch; switching will create/link a customer record at the new branch.
- On confirm, navigate to the other branch's storefront URL (`/<branch-slug>/checkout` or `/t/<tenant>/<branch>/checkout`) — `BranchContext` already handles the switch, and `OrderBuild` will re-price next time they edit. (We won't auto-re-price the cart silently; the user re-enters the new storefront and continues.)

Files: `src/pages/dashboard/Checkout.tsx` only.

## 2. Customer accounts vs branch

Confirmed model (no migration needed):
- `profiles` is tenant-wide (one customer record per tenant).
- `tenant_memberships` already has `branch_id` — we'll use this column to mark a customer's "home branch" (role = `Customer`, `branch_id` = the branch they first ordered from).
- On `placeOrder`, if the signed-in user has no `Customer` membership row for the active tenant/branch, insert one (idempotent on `(profile_id, tenant_id, branch_id, role)`).
- When the user switches branches at checkout (case above) and places an order, a second `Customer` membership row is created for the new branch — so one profile can hold accounts at multiple branches without duplicating profile data.

Files: `src/hooks/useCart.ts` (the `usePlaceOrder` mutation) — add an upsert into `tenant_memberships` before the order insert.

## 3. Payment methods: EFT + PayFast

### 3a. Rename the offline option

In `Checkout.tsx`, change the label from
"Pay on collection / EFT (we'll send instructions)"
to **"EFT — Pay by bank transfer (we'll send banking details)"**. The underlying `paymentMethod === "offline"` value stays the same so no backend wiring changes.

### 3b. Auto-generate a Pro Forma invoice on EFT orders

The Edge Function `generate-invoice-pdf` already supports `kind: "proforma"`. We'll:
1. In `usePlaceOrder` (or right after it returns in `Checkout.tsx`), if `paymentMethod === "offline"`, invoke `generate-invoice-pdf` with `{ order_id, kind: "proforma" }`.
2. The function already writes the PDF to storage and creates an `order_documents` row — `OrderInvoicesList` will then surface it on the order detail page, so the customer can download it from `My Account → Order detail`.
3. Trigger `send-order-email` with a new template variant `order_placed_eft` that:
   - Includes the bank details from `tenant_settings.payments.*` (already configured per `PaymentsTab.tsx`).
   - Attaches/links the Pro Forma PDF (signed URL).
   - Tells the customer to use the order number as their EFT reference.

### 3c. PayFast wiring

Backend is already in place (`payments-create-session`, `payfast-itn`, `tenant_payment_gateways`). The checkout already auto-lists any enabled+credentialed PayFast gateway. To "turn it on" for Sandton City the tenant admin enables PayFast in **Admin → Settings → Payments** (branch override available via `branch_payment_gateways`).

No code change needed for PayFast itself — only verify branch-scoped gateway resolution works on the customer-facing checkout. Today `payments-create-session` resolves `branch_payment_gateways` from `order.branch_id`, which we now reliably set from the locked storefront branch (item 1). So PayFast credentials configured at the **branch** level will be used automatically.

## Technical notes

- The "Change branch" confirmation modal uses the existing `AlertDialog` shadcn component; no new dependencies.
- `usePlaceOrder` already accepts `branchId`; we just always pass `activeBranch.id` from `BranchContext` instead of the dropdown value.
- For the membership upsert, use `.upsert(..., { onConflict: "profile_id,tenant_id,branch_id,role" })` — confirm or add this unique constraint in a tiny migration if it doesn't exist yet.
- Pro Forma generation runs after the order is created but before the user is redirected to the confirmation page; we'll `await` it but show a toast and continue even if PDF generation fails (the order itself is safe).

## Out of scope (will confirm separately)

- Re-pricing the cart in-place when switching branches.
- Distinct EFT-paid vs collection-only payment modes.
- Auto-converting Pro Forma → Tax Invoice on payment receipt.
