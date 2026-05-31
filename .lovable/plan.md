Replace the "coming soon" Terms and Privacy pages on the customer storefront with proper, per-tenant legal documents that the admin can edit in their settings.

## Scope (confirmed)
- **Tenant only** — one T&Cs and one privacy policy per tenant, shared by all branches.
- **Seed a SA e-commerce template** for tenants that haven't written their own.
- **Rich text editor** (WYSIWYG) in the admin.

## 1. Storage
Use the existing `tenant_settings` table (cascading settings, JSONB). Two new keys under a new `legal` category:
- `legal.terms_of_service` — HTML string
- `legal.privacy_policy` — HTML string
- `legal.terms_updated_at` / `legal.privacy_updated_at` — ISO date strings shown as "Last updated".

No schema change — just new setting keys. A migration will seed both keys for every existing tenant using the SA template (interpolating `{{tenant_name}}`, `{{support_email}}`, `{{website_url}}`, `{{country}}`).

## 2. SA e-commerce template (seed content)
Standard structure used by SA online retailers, covering ECT Act and POPIA:

**Terms of Service** sections:
1. About us / definitions
2. Acceptance of terms
3. Account registration
4. Orders, pricing & VAT
5. Payment (PayFast, EFT, account)
6. Production turnaround & delivery (Cloudprinter / courier)
7. Customer-supplied artwork & content responsibility
8. Cancellations & refunds (per ECT Act s44 — print-on-demand exemption noted)
9. Intellectual property
10. Limitation of liability
11. Governing law (South Africa) & dispute resolution
12. Contact details

**Privacy Policy** sections (POPIA-aligned):
1. Who we are & responsible party
2. Information we collect (account, order, payment, uploaded files)
3. How we use it
4. Sharing (PayFast, Cloudprinter, courier, hosting)
5. Cookies & analytics
6. Data retention
7. Your POPIA rights (access, correction, deletion, objection)
8. Security
9. International transfers
10. Contact / Information Officer

Both templates live in `src/lib/legal/defaultTemplates.ts` so the same content powers both the seed migration and a "Restore default template" button in the admin.

## 3. Admin editor
New tab in `AdminSettings`: **Legal** (after Notifications). Two stacked rich text editors using a lightweight WYSIWYG. The project already uses Tiptap-compatible components in a couple of places; if not present, add `@tiptap/react` + starter kit (small, well-supported).

Editor surface per document:
- Title (Terms of Service / Privacy Policy)
- "Last updated" date (auto-stamped on save)
- WYSIWYG (headings, bold/italic, lists, links)
- Buttons: **Save**, **Preview** (opens the customer page in a new tab), **Restore default template**

Saves via the existing `upsert_tenant_setting` RPC (one row per key).

## 4. Customer-facing pages
Update `src/pages/dashboard/PortalTerms.tsx` and `PortalPrivacy.tsx`:
- Read the resolved tenant setting via the existing `useTenantSettings` / `resolve_tenant_setting` path.
- Render the stored HTML inside a `prose` container (Tailwind typography) — no untrusted input concern since only tenant admins can write it.
- Show tenant name in the H1 and "Last updated {{date}}" subheading.
- Loading skeleton while fetching; fall back to the in-code default template if a tenant somehow has no value (defence in depth).

These pages are already routed under `/t/:slug/terms` and `/t/:slug/privacy`, so footer links don't need changes — they're already dynamic per storefront.

## 5. Footer links
Quick audit of the customer footer to confirm the existing `terms` / `privacy` links resolve through the active tenant slug (they already do via the `/t/:slug` route prefix). No code change expected; will verify during implementation.

## Out of scope
- Branch-level overrides (explicitly excluded).
- Versioning / acceptance tracking (customers re-accept on changes) — can be a later phase if needed.
- Cookie consent banner.
- Email notification to customers when terms change.

## Technical notes
- New file: `src/lib/legal/defaultTemplates.ts` — exports `defaultTermsHtml(tenant)` and `defaultPrivacyHtml(tenant)`.
- New file: `src/pages/admin/settings/LegalTab.tsx` — two WYSIWYG editors + save/restore.
- New file: `src/components/admin/RichTextEditor.tsx` — thin Tiptap wrapper with the project's design tokens.
- Edited: `src/pages/admin/AdminSettings.tsx` — register the Legal tab.
- Edited: `src/pages/dashboard/PortalTerms.tsx`, `PortalPrivacy.tsx` — read tenant setting + render HTML.
- Migration: insert default `legal.terms_of_service` / `legal.privacy_policy` for each existing tenant (skip where already set).
