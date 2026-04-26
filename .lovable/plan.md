## Three issues, one pass

### 1. Order Confirmation hard-codes "R" (ZAR) regardless of region

**Root cause:** `src/hooks/useCart.ts` line ~689 in `usePlaceOrder` sends `pricing: { currency: "ZAR", … }` to the `order-engine` Edge Function — a literal string, not the cart's currency. So even though the cart order was correctly stamped with GBP when items were added (line ~115), the final placed order is overwritten with `ZAR`. That's why you see `R 15,72` on the confirmation card while browsing as GBP.

**Fix:**
- Read the cart's stamped currency (`cartOrder.currency`) when placing the order and pass it through to the engine.
- Fall back to the active region (`useRegionalPricing`) only if the cart somehow has no currency, then `"ZAR"` as a last resort.
- This is a one-line conceptual change; the cart already carries the right value.

No other downstream changes needed — `OrderConfirmation.tsx`, `CustomerOrderDetail.tsx`, and `Cart.tsx` already format using `order.currency` / `cart.currency`, so once the order is saved with `GBP` it will render `£15.72`.

### 2. Admin → Pricing → Edit goes blank

**Root cause:** `src/components/admin/PricingRuleForm.tsx` line 148 has `<SelectItem value="">All families</SelectItem>`. Radix Select forbids empty-string values and throws at runtime — the dialog mounts, the Select inside it errors, the whole admin page unmounts to a blank screen. (Nothing to do with multi-currency, despite the timing.)

**Fix:**
- Replace the empty-string sentinel with a real value such as `"__all__"`.
- Treat `"__all__"` as `null` when populating the form (`product_family_id: rule.product_family_id ?? "__all__"`) and when submitting (`product_family_id: values.product_family_id === "__all__" ? null : values.product_family_id`).
- While I'm in this file, also surface a read-only **Currency** field on the form (just an info chip showing `ZAR — source of truth`), so it's obvious to admins that the editor only edits ZAR rules and that other currencies are derived via Platform → Demo Print Pricing → Regenerate. No new editable field — just clarity.

### 3. Strip VAT/Tax from the customer-facing demo

The platform will let tenants configure their own VAT rules later. For the demo, prices should be presented as a single all-in number with no VAT/Tax line.

Files and changes:
- **`src/pages/dashboard/Cart.tsx`** — change "Subtotal (excl. VAT)" to just "Total".
- **`src/pages/dashboard/Checkout.tsx`** — remove the `vatRate`, `vat`, and `total = subtotal + vat` calculations; remove the "VAT (15%) / Tax (15%)" row from the Order Summary; show only Subtotal (or just "Total"); pass `subtotal` (no VAT added) as the order total.
- **`src/hooks/useCart.ts` `usePlaceOrder`** — set `vat_amount: 0`, `total_amount: subtotal` when calling `order-engine`. (Keeps the field for future tenant VAT support; just zero for demo.)
- **`src/pages/dashboard/CustomerOrderDetail.tsx`** — hide the "VAT" row when `order.vat_amount === 0` (so historic non-zero orders still display correctly, but the new demo orders show a clean Subtotal → Total).
- **`src/components/orders/detail/OrderPricingTab.tsx`** (admin/staff order detail) — same treatment: hide the "VAT (15%)" row when `vat_amount === 0`. We keep the row for tenants who configure VAT later.

What I'm **not** changing:
- The DB schema (`vat_amount` column stays — tenants will use it).
- Pricing rule values in the DB (those are net values today and will continue to be).
- The admin/staff side of VAT configuration (out of scope for this fix).

### Out of scope (call out for a follow-up)
- Building tenant-configurable VAT (rate, inclusive vs exclusive, per-region) — that's a real feature, not a quick demo cleanup. Happy to plan it separately when you're ready.

### Files touched
1. `src/hooks/useCart.ts` — pass cart currency through to `order-engine`; zero out VAT for demo.
2. `src/components/admin/PricingRuleForm.tsx` — fix `SelectItem value=""` crash; add read-only currency hint.
3. `src/pages/dashboard/Cart.tsx` — drop "excl. VAT" wording.
4. `src/pages/dashboard/Checkout.tsx` — remove VAT row & calc; show single total.
5. `src/pages/dashboard/CustomerOrderDetail.tsx` — conditionally hide VAT row.
6. `src/components/orders/detail/OrderPricingTab.tsx` — conditionally hide VAT row.
