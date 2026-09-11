// Thin Resend REST helpers shared by the Resend edge functions.
//
// Each tenant brings their own Resend account, so every call takes the
// tenant's own API key (read from the Supabase vault by the caller).
// Docs: https://resend.com/docs/api-reference

const API = "https://api.resend.com";

export interface ResendError {
  status: number;
  body: string;
}

export class ResendApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Resend ${status}: ${body.slice(0, 500)}`);
    this.name = "ResendApiError";
    this.status = status;
    this.body = body;
  }
}

export function normalizeResendApiKey(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function validateResendApiKey(value: string): string | null {
  if (!value) return "Paste a Resend API key first.";
  if (!value.startsWith("re_") || value.length < 12 || /\s/.test(value)) {
    return "This does not look like a Resend API key. Copy the complete key beginning with re_ from Resend.";
  }
  return null;
}

function resendErrorText(error: ResendApiError): string {
  try {
    const parsed = JSON.parse(error.body) as { message?: unknown; name?: unknown };
    return [parsed.name, parsed.message].filter((value): value is string => typeof value === "string").join(" ");
  } catch {
    return error.body;
  }
}

export function describeResendVerificationFailure(error: ResendApiError): string {
  const detail = resendErrorText(error).toLowerCase();
  if (detail.includes("restricted") || detail.includes("permission") || detail.includes("access denied")) {
    return "This Resend key does not have enough access. Create a Full access API key so Document Centre can check domains and manage contacts, segments and broadcasts.";
  }
  if (
    error.status === 400 ||
    error.status === 401 ||
    detail.includes("api key is invalid") ||
    detail.includes("invalid api key")
  ) {
    return "Resend says this API key is invalid or has been revoked. Create a new Full access key in Resend and copy the complete value beginning with re_.";
  }
  if (error.status === 403) {
    return "Resend refused this key. Make sure it is a Full access API key, not a Sending access key.";
  }
  return "Resend could not check this account right now. Please try again shortly.";
}

async function call<T>(
  apiKey: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new ResendApiError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Verified sending domains on the account. */
export async function listDomains(apiKey: string): Promise<Array<{ id: string; name: string; status: string }>> {
  const data = await call<{ data?: Array<{ id: string; name: string; status: string }> }>(apiKey, "/domains");
  return data.data ?? [];
}

/**
 * Verifies the key works and that the from-address domain is verified.
 * Returns a human-readable problem, or null when everything checks out.
 */
export async function verifyAccount(
  apiKey: string,
  fromEmail: string,
): Promise<{ ok: boolean; message: string; domains: string[] }> {
  const normalizedKey = normalizeResendApiKey(apiKey);
  const keyProblem = validateResendApiKey(normalizedKey);
  if (keyProblem) return { ok: false, message: keyProblem, domains: [] };

  const wanted = (fromEmail.split("@")[1] ?? "").trim().toLowerCase();
  if (!wanted) {
    return { ok: false, message: "Enter a valid sender email address before checking the connection.", domains: [] };
  }

  let domains: Array<{ name: string; status: string }>;
  try {
    domains = await listDomains(normalizedKey);
  } catch (e) {
    if (e instanceof ResendApiError) {
      return { ok: false, message: describeResendVerificationFailure(e), domains: [] };
    }
    return { ok: false, message: "Resend could not check this account right now. Please try again shortly.", domains: [] };
  }

  const names = domains.map((d) => d.name);
  const match = domains.find((d) => d.name.toLowerCase() === wanted);
  if (!match) {
    return {
      ok: false,
      message: `The domain "${wanted}" is not set up in this Resend account. Add and verify it in Resend, then try again.`,
      domains: names,
    };
  }
  if (match.status !== "verified") {
    return {
      ok: false,
      message: `The domain "${wanted}" is in Resend but still shows as "${match.status}". Finish the DNS verification in Resend, then try again.`,
      domains: names,
    };
  }
  return { ok: true, message: "Connected. The sending domain is verified.", domains: names };
}

/** Sends one transactional email. Returns Resend's message id. */
export async function sendEmail(
  apiKey: string,
  payload: {
    from: string;
    to: string | string[];
    subject: string;
    html?: string | null;
    text?: string | null;
    cc?: string[] | null;
    bcc?: string[] | null;
    reply_to?: string | string[] | null;
  },
): Promise<string> {
  const data = await call<{ id: string }>(apiKey, "/emails", { method: "POST", body: payload });
  return data.id;
}

/**
 * Contact lists are called "segments" in Resend (formerly "audiences").
 * Creates one and returns its id.
 */
export async function createSegment(apiKey: string, name: string): Promise<string> {
  const data = await call<{ id: string }>(apiKey, "/segments", { method: "POST", body: { name } });
  return data.id;
}

export async function segmentExists(apiKey: string, segmentId: string): Promise<boolean> {
  try {
    await call(apiKey, `/segments/${segmentId}`);
    return true;
  } catch (e) {
    if ((e as ResendApiError).status === 404) return false;
    throw e;
  }
}

export interface ContactInput {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  properties?: Record<string, string>;
  unsubscribed?: boolean;
}

export interface ContactPropertySpec {
  key: string;
  type?: "string" | "number";
  fallback_value?: string | number;
}

/** Custom contact properties already defined on the Resend account. */
export async function listContactProperties(
  apiKey: string,
): Promise<Array<{ id: string; key: string; type: string }>> {
  const data = await call<{ data?: Array<{ id: string; key: string; type: string }> }>(
    apiKey,
    "/contact-properties",
  );
  return data.data ?? [];
}

/**
 * Resend rejects a contact outright (422 "One or more properties do not exist")
 * unless every custom property key has been created on the account first.
 * Creates whatever is missing; treats "already exists" as success.
 */
export async function ensureContactProperties(
  apiKey: string,
  specs: ContactPropertySpec[],
): Promise<void> {
  if (!specs.length) return;
  let existing = new Set<string>();
  try {
    existing = new Set((await listContactProperties(apiKey)).map((p) => p.key.toLowerCase()));
  } catch (e) {
    // A restricted key cannot list properties — let the create attempt below
    // produce the real, actionable error.
    if (!(e instanceof ResendApiError)) throw e;
  }

  for (const spec of specs) {
    if (existing.has(spec.key.toLowerCase())) continue;
    try {
      await call(apiKey, "/contact-properties", {
        method: "POST",
        body: {
          key: spec.key,
          type: spec.type ?? "string",
          ...(spec.fallback_value === undefined ? {} : { fallback_value: spec.fallback_value }),
        },
      });
    } catch (e) {
      const err = e as ResendApiError;
      if (err.status === 409 || /already exists|duplicate/i.test(err.body ?? "")) continue;
      throw e;
    }
  }
}

/**
 * Broadcast merge tag for a contact property. Custom properties live in the
 * same namespace as the built-ins, e.g. {{{contact.first_name|there}}}.
 */
export function contactTag(key: string, fallback = ""): string {
  return `{{{contact.${key}|${fallback}}}}`;
}

/** Adds an existing contact to a segment. Safe to call repeatedly. */
export async function addContactToSegment(
  apiKey: string,
  contactRef: string,
  segmentId: string,
): Promise<void> {
  try {
    await call(apiKey, `/contacts/${encodeURIComponent(contactRef)}/segments/${segmentId}`, {
      method: "POST",
    });
  } catch (e) {
    const err = e as ResendApiError;
    // Already a member.
    if (err.status === 409 || /already/i.test(err.body ?? "")) return;
    throw e;
  }
}

/** Creates or updates a contact inside a segment. Returns the contact id. */
export async function upsertContact(
  apiKey: string,
  segmentId: string,
  contact: ContactInput,
): Promise<string> {
  const base = {
    first_name: contact.first_name ?? undefined,
    last_name: contact.last_name ?? undefined,
    properties: contact.properties ?? undefined,
    unsubscribed: contact.unsubscribed ?? false,
  };
  try {
    const data = await call<{ id: string }>(apiKey, "/contacts", {
      method: "POST",
      body: { email: contact.email, ...base, segments: [{ id: segmentId }] },
    });
    await addContactToSegment(apiKey, data.id, segmentId);
    return data.id;
  } catch (e) {
    const err = e as ResendApiError;
    // Already on the account — update it in place, then make sure it is in the
    // segment (the update endpoint cannot change segment membership).
    if (err.status === 409 || /already exists/i.test(err.body ?? "")) {
      const data = await call<{ id: string }>(
        apiKey,
        `/contacts/${encodeURIComponent(contact.email)}`,
        { method: "PATCH", body: base },
      );
      const contactId = data.id ?? contact.email;
      await addContactToSegment(apiKey, contactId, segmentId);
      return contactId;
    }
    throw e;
  }
}


export async function createBroadcast(
  apiKey: string,
  payload: {
    segment_id: string;
    from: string;
    subject: string;
    html: string;
    text?: string | null;
    reply_to?: string | null;
    name?: string;
    send?: boolean;
    scheduled_at?: string;
  },
): Promise<string> {
  const data = await call<{ id: string }>(apiKey, "/broadcasts", { method: "POST", body: payload });
  return data.id;
}

/** Resend's hosted unsubscribe token — required in every broadcast body. */
export const RESEND_UNSUBSCRIBE_TOKEN = "{{{RESEND_UNSUBSCRIBE_URL}}}";

export function withResendUnsubscribeFooter(
  html: string,
  text: string,
  senderLabel: string,
): { html: string; text: string } {
  const normalizedHtml = html.replace(
    /\{\{\s*(?:unsubscribe_url|unsubscribe_link)\s*\}\}/gi,
    RESEND_UNSUBSCRIBE_TOKEN,
  );
  if (normalizedHtml.includes(RESEND_UNSUBSCRIBE_TOKEN)) return { html: normalizedHtml, text };
  const footer = `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.5;color:#8a8a8a;text-align:center;">
You received this email from ${senderLabel}.<br />
<a href="${RESEND_UNSUBSCRIBE_TOKEN}" style="color:#8a8a8a;text-decoration:underline;">Unsubscribe from these emails</a>
</div>`;
  const closing = normalizedHtml.lastIndexOf("</body>");
  const nextHtml = closing >= 0
    ? `${normalizedHtml.slice(0, closing)}${footer}${normalizedHtml.slice(closing)}`
    : `${normalizedHtml}${footer}`;
  const nextText = `${text}\n\n—\nYou received this email from ${senderLabel}.\nUnsubscribe: ${RESEND_UNSUBSCRIBE_TOKEN}\n`;
  return { html: nextHtml, text: nextText };
}

/** Reads a tenant's Resend key out of the vault via the existing RPC. */
export async function readResendKey(
  // deno-lint-ignore no-explicit-any
  admin: any,
  secretId: string | null | undefined,
): Promise<string | null> {
  if (!secretId) return null;
  const { data, error } = await admin.rpc("read_email_account_secret", { p_secret_id: secretId });
  if (error) throw new Error(`vault: ${error.message}`);
  const key = normalizeResendApiKey(data as string | null);
  return key || null;
}
