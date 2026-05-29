## Plan

1. **Stop using the live image proxy**
   - Remove the `images.weserv.nl` SVG-to-PNG conversion from the order email renderer.
   - This avoids long proxied URLs, external proxy fragility, and Gmail clipping caused by larger/rewritten email content.

2. **Use a real raster logo for email**
   - Add support for an email-specific logo setting such as `branding.email_logo_url`.
   - Prefer that PNG/JPG/WebP URL in emails.
   - Only fall back to the normal tenant `logo_url` when it is already email-safe.
   - If the normal logo is SVG and no email logo exists, show the tenant name as text instead of forcing a broken/proxied image.

3. **Set PostNet to a proper PNG/JPG email logo**
   - Find or create a raster PostNet logo asset in storage.
   - Save it to PostNet’s branding settings as the email logo, leaving the PDF/proforma SVG untouched.

4. **Reduce email HTML size and clipping risk**
   - Keep the email header simple: fixed logo height/width, no proxy URL, no oversized inline image content.
   - Avoid adding anything unnecessary to the email body.

5. **Redeploy the email function**
   - Deploy the updated `send-order-email` function so the next test email uses the new logo behavior.