/**
 * Shared delivery / billing address validation.
 * Used by the storefront checkout, the saved-address dialog and (mirrored)
 * by the order-engine edge function so the browser is never the only gate.
 */

export interface AddressLike {
  contact_name?: string | null;
  company_name?: string | null;
  line1?: string | null;
  line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
}

export type AddressErrors = Partial<Record<keyof AddressLike, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function isZA(country?: string | null) {
  const c = s(country).toLowerCase();
  return c === "" || c === "za" || c === "south africa";
}

/** Postal code rule per country. ZA is a strict 4-digit code. */
export function postalCodeError(value: string, country?: string | null): string | null {
  if (!value) return "Enter a postal code";
  const compact = value.replace(/\s+/g, "");
  if (isZA(country)) {
    return /^\d{4}$/.test(compact) ? null : "Enter a valid 4-digit postal code";
  }
  return /^[A-Za-z0-9-]{3,10}$/.test(compact) ? null : "Enter a valid postal code";
}

/** Digits-only length check; permissive about formatting. */
export function phoneError(value: string): string | null {
  if (!value) return "Enter a contact phone number";
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 9 || digits.length > 15) return "Enter a valid phone number";
  return null;
}

export interface ValidateOptions {
  /** Billing addresses don't need a province dropdown value. */
  requireProvince?: boolean;
  /** Label used in the "who is this going to" message. */
  kind?: "delivery" | "billing";
}

/**
 * Returns a map of field -> message. Empty object means the address is usable.
 */
export function validateAddress(addr: AddressLike, opts: ValidateOptions = {}): AddressErrors {
  const { requireProvince = true } = opts;
  const errors: AddressErrors = {};

  const contact = s(addr.contact_name);
  const company = s(addr.company_name);
  if (!contact && !company) {
    errors.contact_name = "Enter a contact name or company";
    errors.company_name = "Enter a contact name or company";
  }

  if (!s(addr.line1)) errors.line1 = "Enter a street address";
  if (!s(addr.city)) errors.city = "Enter a city or town";
  if (requireProvince && !s(addr.province)) errors.province = "Select a province";

  const pc = postalCodeError(s(addr.postal_code), addr.country);
  if (pc) errors.postal_code = pc;

  const ph = phoneError(s(addr.phone));
  if (ph) errors.phone = ph;

  const email = s(addr.email);
  if (!email) errors.email = "Enter an email address";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address";

  return errors;
}

export function isAddressValid(addr: AddressLike, opts?: ValidateOptions): boolean {
  return Object.keys(validateAddress(addr, opts)).length === 0;
}

const titleCase = (v: string) =>
  v
    .toLowerCase()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase())
    .replace(/\b(Of|And|The|Du|Van|Der)\b/g, (m) => m.toLowerCase())
    .trim();

/** Light tidy-up applied just before the address is saved. */
export function normalizeAddress<T extends AddressLike>(addr: T): T {
  const out: any = { ...addr };
  for (const k of ["contact_name", "company_name", "line1", "line2", "suburb", "province", "country", "email"]) {
    if (typeof out[k] === "string") out[k] = out[k].trim();
  }
  if (typeof out.email === "string") out.email = out.email.toLowerCase();
  if (typeof out.city === "string" && out.city.trim()) out.city = titleCase(out.city);
  if (typeof out.postal_code === "string") out.postal_code = out.postal_code.replace(/\s+/g, "");
  if (typeof out.phone === "string") {
    const p = out.phone.trim();
    out.phone = p.startsWith("+") ? `+${p.slice(1).replace(/[^\d]/g, "")}` : p.replace(/[^\d]/g, "");
  }
  return out as T;
}

/** Field order used when focusing the first problem field. */
export const ADDRESS_FIELD_ORDER: Array<keyof AddressLike> = [
  "contact_name",
  "company_name",
  "line1",
  "line2",
  "city",
  "province",
  "postal_code",
  "phone",
  "email",
];

export function firstInvalidField(errors: AddressErrors): keyof AddressLike | null {
  for (const f of ADDRESS_FIELD_ORDER) if (errors[f]) return f;
  return null;
}
