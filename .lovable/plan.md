## Three fixes to the invoice/quote/proforma email

### 1. Logo not embedding
**Cause:** Some tenant `branding.logo_url` values are stored as relative paths (e.g. `/document-centre-logo.svg`). Email clients can't resolve relative URLs, so the header renders as a solid red band only.

**Fix in `send-order-email/index.ts` (`renderHtml`):**
- Normalise `logo_url` to an absolute URL. If it starts with `/`, prefix with the production site origin (`https://document-centre.com`, with fall-back to `https://document-centre.lovable.app`).
- Add `border:0;outline:none;text-decoration:none` to the `<img>` (Outlook hardening) and a small white background pad so dark logos remain visible on the primary-colour banner.

### 2. Attach the invoice PDF instead of a "View order" link
The PDF already exists in storage (`order_invoices.storage_bucket/path`). Today the email only links to the portal. We'll switch the `invoice_sent` event to actually attach the PDF.

**a. Schema — add attachments support to outbox** (new migration):
```sql
ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
```
Attachment shape: `{ filename, storage_bucket, storage_path, content_type }`.

**b. `_shared/email-queue.ts`:** extend `EnqueueEmailInput` with optional `attachments`; pass through to the insert.

**c. `send-order-email/index.ts` (event = `invoice_sent`):**
- Look up the invoice row (already done) and enqueue with `attachments: [{ filename: \`${invoice_number}.pdf\`, storage_bucket, storage_path, content_type: 'application/pdf' }]`.
- Remove the `View order` CTA for this event (drop `ctaUrl` when `event === 'invoice_sent'`). Other events keep the CTA.

**d. `email-dispatcher/index.ts`:** before sending, if `row.attachments?.length`, download each via `admin.storage.from(bucket).download(path)` into a Uint8Array, then:
- **SMTP (nodemailer):** pass `attachments: [{ filename, content: Buffer.from(bytes), contentType }]`.
- **Microsoft Graph:** add to message body as `attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name, contentType, contentBytes: base64(bytes) }]`.
- **Gmail OAuth:** build a multipart/mixed MIME message (currently sends single-part); include attachments as base64 parts.
Add a 10 MB total cap and log + fail the row with a clear error if exceeded.

Select the new `attachments` column in the outbox claim query.

### 3. Footer email = sending branch's email
**Cause:** Footer hard-codes `tenant.support_email`. Branch context is ignored.

**Fix in `send-order-email/index.ts`:**
- Fetch the branch when `order.branch_id` is set: `select name, email, billing_email, phone from branches`.
- In `renderHtml`, prefer `branch.email` (fallback chain: `branch.email` → `branch.billing_email` → `notif.sender_email` → `tenant.support_email`). Similarly prefer `branch.phone` over `tenant.support_phone`, and `branch.name` over `tenant.legal_name`/`tenant.name` for the footer line.
- This is display-only; the actual SMTP `from`/sender resolution (already branch-aware via `resolveEmailAccount`) is unchanged.

## Files touched
- `supabase/functions/send-order-email/index.ts` — logo absolutising, conditional CTA, attachments wiring, branch-aware footer.
- `supabase/functions/_shared/email-queue.ts` — `attachments` field.
- `supabase/functions/email-dispatcher/index.ts` — download + attach across SMTP / Graph / Gmail; include `attachments` in outbox select.
- `supabase/migrations/<new>.sql` — add `email_outbox.attachments`.

## Out of scope
- No changes to `generate-invoice-pdf`, `quote-pdf`, `send-quote-email`, or any UI.
- No change to idempotency, SMTP resolution, or banking-details block.
