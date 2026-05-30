# Fix order confirmation email: logo sizing + missing proforma attachment

Two issues spotted in the live `order_received` email for INV-00066:

1. **Logo renders huge** — the PostNet logo fills the full email width even though the CSS says `max-height:40px`. Outlook (and several other clients) ignore CSS sizing on `<img>` and fall back to the image's native pixel dimensions. The logo needs HTML `width`/`height` attributes plus a sensible `max-width`.
2. **No proforma attached** — only a "View order" link is shown. The proforma PDF *is* being generated (in parallel with the email), it's just never attached. The original intent was that customers receive the order confirmation **with** the proforma PDF attached so they can pay via EFT immediately.

## Changes

### 1. Email logo sizing — industry-standard constraints

`supabase/functions/send-order-email/index.ts` → `renderHtml()`:
- Replace the bare `<img style="max-height:40px">` with a properly bounded image: `width="auto"` is unreliable, so set both `max-width: 180px` and `max-height: 48px` via inline CSS **and** add an HTML `height="48"` attribute as the Outlook fallback. Use `width="auto"` via CSS only.
- Wrap the logo cell so anything that does ignore CSS at least can't blow past 200px wide (constrain via the parent `<td>` `width="200"`).
- Industry norms for email logos: ~150–200px max width, ~40–60px max height. We'll target **max 180×48**.

This matches `_shared/branded-shell.ts` conventions and how Mailchimp/Postmark recommend sizing transactional logos.

### 2. Attach the proforma to the order confirmation email

Today's flow (`supabase/functions/order-engine/index.ts`, `createOrderWithJobs` side-effect):

```text
Promise.all([
  triggerInvoice(... "proforma"),   // generates PDF
  triggerEmail(... "order_received") // sends email — no attachment
])
```

The two run in parallel, so the email goes out before (or alongside) the proforma and never knows about it.

**New flow:** generate the proforma first, then send the confirmation with the resulting `invoice_id`.

```text
const invoiceRes = await triggerInvoice(... "proforma")   // returns { invoice_id }
await triggerEmail(... "order_received", { invoice_id: invoiceRes.invoice_id })
```

`send-order-email/index.ts` updates for the `order_received` branch:
- Accept an optional `invoice_id` in the body (already accepted for `invoice_sent` — generalise it).
- When present, fetch the invoice row (same query already used for `invoice_sent`) and add the same `attachments: [{ filename, storage_bucket, storage_path, content_type }]` block to the `enqueueEmail` call.
- Tweak the body copy slightly so customers know the proforma is attached: append "Your proforma invoice is attached for your records." to the `order_received` body when `invoice_id` is present.
- Keep the existing "View order" CTA.

No change to `invoice_sent` (still used by the admin "Send invoice" action in `src/lib/orders/mutations.ts`).

### 3. Verification

- Re-place a test order; confirm the inbox shows a small logo (~180×48) and a `<orderNo>.pdf` attachment.
- Check Edge Function logs for `send-order-email` to ensure the attachment was queued.
- Confirm the admin-triggered `invoice_sent` flow still attaches correctly (unchanged).

## Out of scope

- No changes to other event emails (payment_received, dispatched, etc.) — they don't carry attachments today and the user only flagged the order confirmation.
- No change to `generate-invoice-pdf` itself.
- No change to the branded shell used for platform emails.
