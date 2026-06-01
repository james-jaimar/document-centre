
# Legalities & Stripe wire-up

Anchor facts:
- **Legal entity:** Jaimar Developments Ltd, Company No. 17071122, registered in England & Wales (UK).
- **Trading model:** "Jaimar Developments Ltd t/a Document Centre" — single entity, brand only.
- **Stripe:** Single Jaimar Stripe account, used for **platform billing only** (Jaimar invoices tenants like PostNet). Tenants configure their own Stripe in `tenant_payment_gateways` for taking their customers' money — that money never touches Jaimar.
- **Legal docs scope (this round):** Platform Terms of Service + Privacy Policy governing Jaimar ↔ tenant relationship.

Important consequence of "UK Ltd selling SaaS into South Africa": this is a B2B cross-border digital service. Default UK VAT treatment is **out of scope for UK VAT** (reverse charge / place-of-supply is the customer's country); SA-based PostNet may owe SA VAT under their own electronic-services rules. Legal docs and invoice templates must reflect that — I'll flag it but you'll want an accountant to sign off before going live.

## 1. Centralised entity constants

Create `src/lib/legal/entity.ts` as the single source of truth:

```ts
export const LEGAL_ENTITY = {
  legalName: "Jaimar Developments Ltd",
  tradingName: "Document Centre",
  fullDisplay: "Jaimar Developments Ltd t/a Document Centre",
  companyNumber: "17071122",
  jurisdiction: "England & Wales",
  registeredOffice: "<TBD — need your registered office address>",
  contactEmail: "<TBD — e.g. legal@jaimar.dev>",
  supportEmail: "<TBD — e.g. support@document-centre.com>",
  dpoEmail: "<TBD>",
  parentDomain: "jaimar.dev",
  productDomain: "document-centre.com",
  vatNumber: "<TBD — UK VAT no. if registered, else null>",
} as const;
```

Every footer, invoice template, email signature, legal doc, and Stripe metadata field will import from here. No hard-coded "Document Centre" legal references anywhere else.

## 2. Update visible surfaces

Replace ad-hoc legal copy in:
- Marketing footer (`src/pages/Index.tsx`, `Contact.tsx`)
- Storefront footer (`src/pages/storefront/StorefrontLanding.tsx` and tenant portal layouts)
- Admin/Branch/Platform portal footers
- Auth pages (`Auth.tsx`, `AuthCallback.tsx`, `ResetPassword.tsx`) — small "© Jaimar Developments Ltd" line
- Email templates (`send-email` edge function templates) — signature block
- `index.html` `<meta name="author">` and Schema.org JSON-LD organisation block

## 3. Legal documents (Platform ToS + Privacy)

Two new entries seeded into the existing `legal_documents` infrastructure (via `useLegalDocument` / `defaultTemplates.ts`):

- **`platform_terms_of_service`** — Jaimar ↔ tenant (PostNet) terms. Covers: SaaS licence grant, acceptable use, tenant responsibilities for their end customers, subscription billing & cancellation, SLA references (best-effort initially), liability cap, governing law = **England & Wales**, disputes via UK courts.
- **`platform_privacy_policy`** — UK GDPR compliant. Jaimar as data controller for platform data (tenant admin accounts, billing data, support comms) and **data processor** for tenant-customer data. ICO registration line (you may need to register with the ICO as a data controller — separate action item for you).

Both rendered via existing `LegalLayout` and linked from marketing site footer + tenant admin portal footer at `/legal/terms` and `/legal/privacy`.

A short **Data Processing Addendum (DPA)** stub is included as a section inside the Platform ToS rather than a separate doc — it can be split later when PostNet's legal team reviews it.

Storefront-facing tenant ToS / Privacy templates and POPIA cookie banner are **out of scope this round** per your answer.

## 4. Stripe live key cutover

Two secrets to update in Supabase Edge Function Secrets:

- `STRIPE_SECRET_KEY` → live `sk_live_...`
- `STRIPE_WEBHOOK_SECRET` → live `whsec_...` from the live-mode webhook endpoint on `https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/stripe-webhook` (the platform subscription webhook — distinct from the per-tenant `stripe-order-webhook`).

I will trigger `update_secret` when you confirm — you paste the values into the secure form, I never see them.

Also update `create-checkout/index.ts` to:
- Set `statement_descriptor_suffix: "DOC CENTRE"` on the subscription so PostNet's bank statement reads `JAIMAR DEVELOPMENTS* DOC CENTRE`.
- Add `metadata.legal_entity = "Jaimar Developments Ltd"` and `metadata.company_number = "17071122"` on every Customer + Subscription for audit clarity.
- Default `currency` policy: tenant subscriptions priced in **GBP** (Jaimar's home currency) unless `platform_pricing_plans.region_id` overrides. Confirm — you may want ZAR pricing for SA tenants. (Open question below.)

No DB schema changes needed for the Stripe side — `tenant_subscriptions`, `platform_pricing_plans`, `stripe_customer_id` columns already exist.

## 5. Invoice / receipt branding

Stripe-hosted invoices inherit branding from the Stripe Dashboard (logo, colours, business address). Action for you in Stripe Dashboard:
- Business name: `Jaimar Developments Ltd`
- Public business name on receipts: `Document Centre`
- Support email + phone, support URL = `https://document-centre.com/support`
- Upload `public/document-centre-logo.svg` (rasterised PNG, ≥128×128) as the brand mark.

I'll add a short paragraph to the Platform ToS pointing customers at this branding for any billing dispute.

## Open questions before I implement

1. **Registered office address** — what's the UK address on file at Companies House? I need it for legal docs and Stripe metadata.
2. **Email addresses** — confirm `legal@jaimar.dev`, `support@document-centre.com`, `dpo@jaimar.dev` (or alternatives). Mailboxes must exist.
3. **VAT** — is Jaimar Developments Ltd UK-VAT-registered? If yes, give me the number; if no, ToS just omits the VAT line.
4. **Subscription pricing currency** — GBP across the board, or GBP for international tenants and ZAR for SA tenants? This affects how I configure the live Stripe Prices for the existing `platform_pricing_plans`.
5. **Live webhook endpoint** — confirm I should keep the existing edge function URL (`stripe-webhook`) and you'll point the new live-mode webhook at it, or do you want a fresh function name like `stripe-platform-webhook` for clarity?

I'll wait for these before writing any code or triggering `update_secret` for the live keys.
