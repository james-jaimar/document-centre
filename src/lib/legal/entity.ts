/**
 * Single source of truth for the legal entity behind Document Centre.
 *
 * Document Centre is a trading name of Jaimar Developments Ltd (UK).
 * Every footer, invoice template, legal document, email signature, and
 * Stripe metadata field MUST import from here — never hard-code.
 */
export const LEGAL_ENTITY = {
  legalName: "Jaimar Developments Ltd",
  tradingName: "Document Centre",
  fullDisplay: "Jaimar Developments Ltd t/a Document Centre",
  companyNumber: "17071122",
  jurisdiction: "England & Wales",
  registeredOffice: "12 Burghley Park Close, Lincoln, LN6 9XY, United Kingdom",
  contactEmail: "hello@document-centre.com",
  supportEmail: "hello@document-centre.com",
  dpoEmail: "hello@document-centre.com",
  parentDomain: "jaimar.dev",
  productDomain: "document-centre.com",
  /** Not VAT-registered. */
  vatNumber: null as string | null,
  /** Default subscription currency for international tenants. SA tenants billed in ZAR via platform_pricing_plans.region_id. */
  defaultCurrency: "GBP" as const,
} as const;

export type LegalEntity = typeof LEGAL_ENTITY;
