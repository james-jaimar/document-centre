# Wire up hello@document-centre.com, contact page & branded emails

This work uses your **existing** SMTP-based pipeline (`send-email` Edge Function → `email_outbox` → `email-dispatcher` → your SMTP server). No Lovable Email domain or external connector is involved.

## Scope

1. Set `hello@document-centre.com` as the public/support contact email everywhere it shows on the marketing site, footers, legal pages, and as the default `from`/`reply_to` on outgoing platform emails.
2. Build a **Contact page** at `/contact` (linked from the marketing footer + header) with a beautiful, brand-matched form. Submitting it:
   - Stores the enquiry in a new `contact_submissions` table.
   - Sends a notification email to `hello@document-centre.com` via the existing `send-email` Edge Function.
   - Sends an **auto-reply** to the visitor ("Thanks, we'll be in touch") using a branded HTML template.
3. Re-skin all **6 auth-flow emails** (signup confirmation, password reset, magic link, member invite, platform-admin invite, email change) with a shared Document Centre branded HTML wrapper, sent through the same SMTP pipeline.
4. Re-skin the existing **transactional/order emails** (order confirmation, status updates, invoice email) with the same branded wrapper.
5. Add `hello@document-centre.com` to the Document Centre `email_accounts` row (or create one) as the platform-default sender so every queued email defaults to that From address.

## What you'll see when it's done

- A new "Contact" link in the marketing header & footer → opens a polished contact page with hero, form (Name / Email / Company / Message), trust strip, and contact details.
- Every auth/system email you receive arrives in a Document Centre branded shell (logo, navy hero, brand button, footer with legal links and `hello@document-centre.com`).
- The marketing footer's "Privacy / Terms / Email" all point to the right places, and the email icon mailto's `hello@document-centre.com`.

## File layout

```text
src/
  pages/
    Contact.tsx                          ← new public page
  components/
    marketing/
      MarketingHeader.tsx                ← extracted header w/ Contact link (optional refactor)
  pages/legal/LegalLayout.tsx            ← add Contact link to sub-nav
  pages/MarketingLanding.tsx             ← footer: real Contact link, mailto = hello@
supabase/
  functions/
    _shared/
      email-templates/
        branded-shell.ts                 ← shared HTML wrapper (header/footer, brand colours)
        contact-notification.ts          ← internal notification template
        contact-autoreply.ts             ← visitor auto-reply
        auth-signup.ts                   ← branded signup confirmation
        auth-password-reset.ts
        auth-magic-link.ts
        auth-invite-member.ts
        auth-invite-platform-admin.ts
        auth-email-change.ts
        order-confirmation.ts
        order-status-update.ts
        order-invoice.ts
    submit-contact/index.ts              ← new public Edge Function (verify_jwt = false)
  migrations/                            ← via migration tool
    contact_submissions table + RLS
    email_accounts seed for hello@document-centre.com (platform default)
```

## Technical details

### 1. `contact_submissions` table

Columns: `id uuid pk default gen_random_uuid()`, `name text not null`, `email text not null`, `company text`, `message text not null`, `source text default 'marketing_site'`, `user_agent text`, `ip text`, `status text default 'new'`, `created_at timestamptz default now()`.

RLS: enable; **no public select**. Insert policy via the Edge Function only (function uses service role). Admins (`platform_admin`) can `select` and `update status`.

### 2. `submit-contact` Edge Function (public, `verify_jwt = false`)

- CORS headers (matching project pattern).
- Zod-validate body: `name 1..100`, `email valid + ≤255`, `company ≤120`, `message 10..2000`.
- Light rate limit: refuse if 5+ rows from the same `email` in the last 10 minutes.
- Insert row into `contact_submissions` (service role).
- Call `send-email` (or directly enqueue via shared `enqueueEmail`) twice:
  - **Notification** → `to: hello@document-centre.com`, `reply_to: <visitor email>`, template = `contact-notification.ts`.
  - **Auto-reply** → `to: <visitor email>`, `from: hello@document-centre.com`, `from_name: 'Document Centre'`, template = `contact-autoreply.ts`.
- Return `{ ok: true }` (never echo back submitter data).

### 3. `branded-shell.ts` (shared HTML wrapper)

A single `renderBranded({ title, preheader, bodyHtml, ctaLabel?, ctaUrl? })` helper that produces a table-based HTML email matching the marketing site:

- White background (`#ffffff`).
- Navy header band with the Document Centre logo.
- Inter / system-ui font stack.
- Brand button (navy, `--dc-blue` hover) for CTAs.
- Footer with `© Document Centre`, mailto `hello@document-centre.com`, and links to `/privacy` and `/terms`.

All 11 templates above import this shell, pass title + body fragment + optional CTA. Plain-text fallback is generated by stripping HTML.

### 4. Wiring existing senders to branded templates

- `request-signup` → use `auth-signup` template.
- `request-password-reset` → `auth-password-reset`.
- `invite-member` → `auth-invite-member`.
- `invite-platform-admin` → `auth-invite-platform-admin`.
- `manage-user` (email-change path) → `auth-email-change`.
- `send-order-email` (order create / status / invoice) → `order-*` templates.

Each call passes `from_email: 'hello@document-centre.com'`, `from_name: 'Document Centre'`, `reply_to: 'hello@document-centre.com'` (unless tenant has overridden via `email_accounts`).

### 5. Platform default sender

Migration seeds (or upserts) one row in `email_accounts` with `tenant_id = null`, `branch_id = null`, `is_default = true`, `from_email = 'hello@document-centre.com'`, `from_name = 'Document Centre'`, using the existing platform SMTP secrets (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`). This makes `hello@` the implicit From for any queued email that doesn't explicitly set one — including future tenants until they configure their own SMTP.

### 6. UI updates

- `MarketingLanding.tsx` footer: Mail icon `mailto:hello@document-centre.com`, real `<Link to="/contact">Contact</Link>`, and Privacy/Terms links (already done).
- Marketing header (top of `MarketingLanding`): add `Contact` nav item.
- `legal/LegalLayout.tsx` sub-nav: add Contact tab alongside Privacy & Terms.
- `Contact.tsx`: hero in navy with "Get in touch" headline + supporting copy; two-column layout on desktop (form left, contact info right with mailto, response-time note, and a small "looking for support on an existing storefront?" hint pointing customers back to their tenant portal); single column on mobile. Validation via Zod + react-hook-form, success state in-place ("Thanks — we've got it. Watch your inbox for a confirmation."), submit button disabled while pending, toast on error.

### 7. App routing

Add `<Route path="/contact" element={<Contact />} />` in `App.tsx` next to `/privacy` and `/terms`.

## Out of scope (intentionally)

- No Lovable Email domain setup, no Resend/SendGrid, no DNS changes — you're staying on your own SMTP.
- No marketing/newsletter capability.
- Per-tenant SMTP override UI is unchanged (already exists via `email-account-manage`).
- Contact-submissions admin viewer page: noted as a follow-up; data is captured and queryable from `/platform` directly via Supabase if you need it before then.