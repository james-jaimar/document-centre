/**
 * Single source of truth for the version and effective date of every
 * platform legal document. When you materially change a document, bump
 * its version here and update `effective` — Phase 2 will read these to
 * record what each subscriber accepted in `subscription_acceptances`,
 * and to trigger re-acceptance when the version moves forward.
 *
 * Versions are integers, monotonic. Do not reuse numbers.
 */
export const LEGAL_DOCS = {
  terms: {
    slug: "terms",
    title: "Terms of Service",
    route: "/terms",
    version: 2,
    effective: "1 January 2027",
  },
  privacy: {
    slug: "privacy",
    title: "Privacy Policy",
    route: "/privacy",
    version: 2,
    effective: "1 January 2027",
  },
  dpa: {
    slug: "dpa",
    title: "Data Processing Addendum",
    route: "/legal/dpa",
    version: 1,
    effective: "1 January 2027",
  },
  aup: {
    slug: "aup",
    title: "Acceptable Use Policy",
    route: "/legal/aup",
    version: 1,
    effective: "1 January 2027",
  },
  sla: {
    slug: "sla",
    title: "Service Availability",
    route: "/legal/sla",
    version: 1,
    effective: "1 January 2027",
  },
  billing: {
    slug: "billing",
    title: "Billing & Cancellation Policy",
    route: "/legal/billing",
    version: 1,
    effective: "1 January 2027",
  },
  subprocessors: {
    slug: "subprocessors",
    title: "Sub-processors",
    route: "/legal/sub-processors",
    version: 1,
    effective: "1 January 2027",
  },
  security: {
    slug: "security",
    title: "Security & Backups",
    route: "/legal/security",
    version: 1,
    effective: "1 January 2027",
  },
  cookies: {
    slug: "cookies",
    title: "Cookie Policy",
    route: "/legal/cookies",
    version: 1,
    effective: "1 January 2027",
  },
} as const;

export type LegalDocSlug = keyof typeof LEGAL_DOCS;

export const LEGAL_DOCS_LIST = Object.values(LEGAL_DOCS);

/** Documents the subscriber must accept at branch-subscription checkout. */
export const CHECKOUT_REQUIRED_DOCS: LegalDocSlug[] = [
  "terms",
  "privacy",
  "dpa",
  "billing",
];
