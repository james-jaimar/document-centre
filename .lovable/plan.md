# Upgrade the tenant email editor for imported HTML campaigns

## Recommended approach

Build a hybrid editor that preserves professionally designed email HTML while making everyday changes safe for tenant staff.

The uploaded `email-01.html` is a suitable starting template, but it is a complete email document with responsive styles and four relative image paths. Pasting it into the current rich-text editor is unsafe: the current campaign sender wraps authored content in another email document, and the rich-text editor can restructure table-based email markup.

## What will change

### 1. Import complete HTML files safely

- Add **Import HTML** when creating or editing a tenant marketing template.
- Accept `.html` files, validate their structure, and preserve the document head, Outlook conditionals, responsive rules, tables and inline styles.
- Detect complete documents versus body fragments so preview and sending never create nested `<html>` or `<body>` elements.
- Show clear warnings for unsupported or risky content instead of silently changing it.

### 2. Provide safe visual editing without rewriting the design

Use three coordinated views:

- **Preview** — desktop/mobile rendering of the finished email.
- **Content** — select editable text, links or images from the email and change their values through focused controls; the surrounding HTML stays intact.
- **Code** — a proper HTML editor with syntax highlighting, search, line numbers and validation.

Simple templates can continue using the existing rich-text tools. Imported/advanced templates default to the protected Content/Code workflow so switching views cannot damage their tables or responsive layout.

### 3. Add an email image manager

- Detect `assets/deskpad.jpg`, `assets/deskpad-thumb.jpg`, `assets/planner-thumb.jpg` and `assets/calendar-thumb.jpg` in this file as unresolved images.
- Let the tenant upload a replacement for each image, store it in the existing email image storage, and update the HTML automatically.
- Allow replace, alt-text edit, link edit and image preview from the Content view.
- Keep the existing 5 MB image limit and public email-safe URLs.

### 4. Make dynamic text understandable and reliable

Add a labelled field picker rather than exposing only token names:

- **Contact:** contact name, business name, email.
- **Personal link:** recipient-specific shop/activation link.
- **Tenant:** tenant/trading name, website and postal address.
- **Campaign:** preview text and Resend-hosted unsubscribe link.

Fields can be inserted into the subject, visible text, links, image URLs/alt text and plain-text fallback where appropriate. Preview values will make every field visibly testable.

For Resend broadcasts, convert these fields to Resend contact properties at send time and map the unsubscribe field to Resend's required hosted unsubscribe URL. Do not append a second unsubscribe footer when the template already contains that field.

### 5. Improve confidence before sending

- Generate the plain-text fallback from the HTML, with an option to edit it manually.
- Add checks for unresolved local images, broken/relative links, unknown dynamic fields, missing unsubscribe handling and malformed HTML.
- Show an explicit **Ready to send** result or a list of items to fix.
- Keep the existing dry run, then add a **Send test email** action before the full broadcast.
- Preview the actual final document used by Resend, including sample personalisation and unsubscribe handling.

### 6. Prepare the uploaded 2027 Edition email

Import `email-01.html` as a tenant-owned draft for The 2027 Edition, preserving its current design and subject. Convert:

- `{{sender_postal_address}}` to the tenant postal-address field.
- `{{unsubscribe_url}}` to the Resend-hosted unsubscribe field.
- The four `assets/...` references into image slots awaiting uploads.

The draft will not be considered send-ready until all four images have been supplied. Existing links and copy remain unchanged.

## Technical notes

- Extend the shared tenant/platform template editor rather than creating another separate editor.
- Add a small HTML document parser/serializer and a shared final-render function used by both preview and `resend-broadcast-send`, preventing preview/send drift.
- Record whether a template is `simple` or `advanced`, plus preview text, so advanced HTML never passes through TipTap.
- Update the Resend token map for email, website, postal address, preview text and hosted unsubscribe.
- Keep tenant ownership and existing template access rules; any new template fields use the same policies.
- Validate with the uploaded file at desktop and mobile widths, then run a dry run and a single-recipient test without launching a full campaign.
