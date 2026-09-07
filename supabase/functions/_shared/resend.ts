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
  let domains: Array<{ name: string; status: string }>;
  try {
    domains = await listDomains(apiKey);
  } catch (e) {
    const err = e as ResendApiError;
    if (err.status === 401 || err.status === 403) {
      return { ok: false, message: "Resend rejected the API key. Create a new key in Resend and paste it again.", domains: [] };
    }
    return { ok: false, message: err.message, domains: [] };
  }

  const names = domains.map((d) => d.name);
  const wanted = (fromEmail.split("@")[1] ?? "").toLowerCase();
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

/** Creates or updates a contact inside a segment. Returns the contact id. */
export async function upsertContact(
  apiKey: string,
  segmentId: string,
  contact: ContactInput,
): Promise<string> {
  const body = {
    email: contact.email,
    first_name: contact.first_name ?? undefined,
    last_name: contact.last_name ?? undefined,
    properties: contact.properties ?? undefined,
    unsubscribed: contact.unsubscribed ?? false,
    segments: [{ id: segmentId }],
  };
  try {
    const data = await call<{ id: string }>(apiKey, "/contacts", { method: "POST", body });
    return data.id;
  } catch (e) {
    const err = e as ResendApiError;
    // Already on the account — update it in place instead.
    if (err.status === 409 || /already exists/i.test(err.body)) {
      const data = await call<{ id: string }>(
        apiKey,
        `/contacts/${encodeURIComponent(contact.email)}`,
        { method: "PATCH", body },
      );
      return data.id;
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
  if (html.includes(RESEND_UNSUBSCRIBE_TOKEN)) return { html, text };
  const footer = `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.5;color:#8a8a8a;text-align:center;">
You received this email from ${senderLabel}.<br />
<a href="${RESEND_UNSUBSCRIBE_TOKEN}" style="color:#8a8a8a;text-decoration:underline;">Unsubscribe from these emails</a>
</div>`;
  const closing = html.lastIndexOf("</body>");
  const nextHtml = closing >= 0
    ? `${html.slice(0, closing)}${footer}${html.slice(closing)}`
    : `${html}${footer}`;
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
  return (data as string) || null;
}
