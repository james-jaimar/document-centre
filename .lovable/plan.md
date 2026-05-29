## Goal
Make the PostNet logo reliably appear in customer emails while keeping the attached PDFs unchanged.

## Diagnosis
The current branding setting points email HTML to an SVG logo:
`.../tenant-assets/.../logo.svg?...`

Many email clients do not render SVG images in email bodies, even when the URL is public and correct. The PDF can still look perfect because PDF rendering supports the asset differently.

## Plan
1. **Add email-safe logo handling in `send-order-email`**
   - Detect when the tenant branding logo is an SVG.
   - Prefer an email-specific raster logo setting if available, e.g. `email_logo_url`.
   - Fall back to the normal `logo_url` only when it is already email-safe.

2. **Set PostNet’s email logo to a PNG/JPG asset**
   - Use an existing PNG/JPG PostNet logo if one is already in tenant assets.
   - If only SVG exists, create/upload a PNG version and store it as the email logo setting.

3. **Redeploy the email function**
   - Deploy `send-order-email` so future customer emails use the email-safe logo.

## Expected result
Future order confirmation emails for PostNet will show the logo, while invoices/proformas continue using the current PDF design.