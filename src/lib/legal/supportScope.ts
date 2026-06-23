/**
 * Single source of truth for what a Document Centre platform subscription
 * includes — used on the pre-checkout disclosure card (Phase 2), the
 * marketing pricing page, and the SLA / Support policy.
 *
 * Keep this honest. Anything not listed under `included` is by definition
 * a paid extra or outside scope.
 */
export const SUPPORT_SCOPE = {
  included: [
    "Access to the Document Centre platform and admin portal",
    "Branch admin dashboard, branded storefront, and customer ordering flow",
    "Product, pricing, and catalogue configuration tools",
    "Order lifecycle, quoting, and production workflow",
    "Customer upload, preflight, and proofing tools",
    "Email support during business hours (UK)",
    "Bug fixes and platform updates",
    "Reasonable onboarding assistance during initial setup",
    "Stripe-hosted billing portal for invoices, receipts, and payment methods",
  ],
  notIncluded: [
    "Custom product or template setup at scale",
    "Custom development, integrations, or APIs beyond the published platform",
    "Bulk data import, cleanup, or migration",
    "Print-file checking as a human service (preflight is automated)",
    "Customer-support handling for a branch's own end-customers",
    "Artwork, design, repro, or DTP services",
    "Phone support or guaranteed response-time SLAs",
    "On-premises installation or self-hosting",
  ],
  availabilityTarget: "99.5% per calendar month, excluding scheduled maintenance, third-party outages and force majeure",
  supportChannel: "email",
  supportHoursTz: "Europe/London",
} as const;
