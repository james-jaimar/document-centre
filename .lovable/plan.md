

## Upgrade Pricing Tab to Match Reference System

### What the reference system shows (and we currently lack)

1. **Delivery line with description** — "Road Freight 2-3 days (transit time only, not production)" shown as a labelled row with amount
2. **"Send" button on each invoice** — ability to email the Proforma or Tax Invoice directly to the customer
3. **"Request" payment button** — sends a payment request email to the customer
4. **Invoice dates** — each invoice row shows the issued date
5. **Billing Address** — displayed within the Pricing tab (not just on Delivery tab)

### Changes

**`src/components/orders/OrderInvoicesList.tsx`**
- Add a "Send" button next to each invoice's View/Download buttons
- Sends the invoice to the customer via the existing `send-order-email` edge function (or a new `sendInvoiceEmail` mutation)
- Show a loading/sending state and success toast

**`src/lib/orders/mutations.ts`**
- Add `sendInvoiceEmail(invoiceId: string, orderId: string)` function that invokes `send-order-email` with an appropriate event key or a new dedicated endpoint

**`src/components/orders/detail/OrderPricingTab.tsx`**
- Add delivery description text (from order metadata or fulfilment settings) below the Delivery amount line
- Show Billing Address at the bottom of the Pricing tab (pull from `addresses` prop — needs to be passed in)
- Add a "Request Payment" button in the payments section that triggers a payment request email to the customer

**`src/pages/admin/AdminOrderDetail.tsx`**
- Pass `addresses` to `OrderPricingTab` so it can render the billing address

**`supabase/functions/send-order-email/index.ts`**
- Add `invoice_sent` event key for manually sending an invoice PDF as an email attachment
- Add `payment_request` event key for requesting payment from the customer

### Files changed

| File | Change |
|------|--------|
| `src/components/orders/OrderInvoicesList.tsx` | Add "Send" button per invoice row, call send mutation |
| `src/components/orders/detail/OrderPricingTab.tsx` | Add delivery description, billing address, request payment button |
| `src/pages/admin/AdminOrderDetail.tsx` | Pass `addresses` prop to `OrderPricingTab` |
| `src/lib/orders/mutations.ts` | Add `sendInvoiceEmail` and `requestPayment` mutation helpers |
| `supabase/functions/send-order-email/index.ts` | Add `invoice_sent` and `payment_request` event types with email templates |

### Technical notes
- The "Send" button will invoke `send-order-email` with `event_key: "invoice_sent"` and the invoice ID, which will attach the PDF to the email
- "Request Payment" sends a `payment_request` email containing banking details and amount due
- Billing address rendering reuses the same address format from `OrderDeliveryTab`
- No new database tables needed

