// Shared helpers for injecting open-pixel + click-tracking into outbound emails.
// Tokens are HMAC-signed so a recipient (or anyone) cannot forge events for
// another campaign / recipient.

const encoder = new TextEncoder();

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"],
  );
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export interface TrackingTokenPayload {
  c: string;            // campaign id
  r: string;            // recipient id
  k: "o" | "c";         // kind: open | click
  u?: string;           // click target url
}

export async function signTrackingToken(payload: TrackingTokenPayload): Promise<string> {
  const secret = Deno.env.get("EMAIL_TRACKING_HMAC_SECRET");
  if (!secret) throw new Error("EMAIL_TRACKING_HMAC_SECRET not configured");
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyTrackingToken(token: string): Promise<TrackingTokenPayload | null> {
  const secret = Deno.env.get("EMAIL_TRACKING_HMAC_SECRET");
  if (!secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const key = await importHmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC", key, b64urlDecode(sig), encoder.encode(body),
    );
    if (!ok) return null;
    const parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!parsed?.c || !parsed?.r || !parsed?.k) return null;
    return parsed as TrackingTokenPayload;
  } catch {
    return null;
  }
}

/** Returns the tracking endpoint URL for the email-track edge function. */
function trackBaseUrl(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/email-track`;
}

/** 1x1 GIF open-pixel URL. */
export async function buildPixelUrl(campaignId: string, recipientId: string): Promise<string> {
  const token = await signTrackingToken({ c: campaignId, r: recipientId, k: "o" });
  return `${trackBaseUrl()}?t=${encodeURIComponent(token)}`;
}

/** Wrap a single URL in a tracked redirect. */
export async function buildClickUrl(
  campaignId: string, recipientId: string, targetUrl: string,
): Promise<string> {
  const token = await signTrackingToken({ c: campaignId, r: recipientId, k: "c", u: targetUrl });
  return `${trackBaseUrl()}?t=${encodeURIComponent(token)}`;
}

/**
 * Rewrites all <a href="..."> attributes in `html` to go through the tracker.
 * Skips: mailto:, tel:, #anchors, and existing tracker URLs.
 */
export async function rewriteLinksForTracking(
  html: string, campaignId: string, recipientId: string,
): Promise<string> {
  const base = trackBaseUrl();
  const matches = [...html.matchAll(/href\s*=\s*"([^"]+)"/gi)];
  let out = html;
  // Build replacements first to allow async signing
  const replacements: Array<[string, string]> = [];
  for (const m of matches) {
    const url = m[1];
    if (!url) continue;
    if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("#")) continue;
    if (url.startsWith(base)) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    const tracked = await buildClickUrl(campaignId, recipientId, url);
    replacements.push([`href="${url}"`, `href="${tracked}"`]);
  }
  // Apply unique replacements
  const seen = new Set<string>();
  for (const [from, to] of replacements) {
    if (seen.has(from)) continue;
    seen.add(from);
    out = out.split(from).join(to);
  }
  return out;
}

/** Append a 1x1 tracking pixel to the closing </body> (or end of doc). */
export async function appendTrackingPixel(
  html: string, campaignId: string, recipientId: string,
): Promise<string> {
  const pixel = await buildPixelUrl(campaignId, recipientId);
  const img = `<img src="${pixel}" width="1" height="1" alt="" style="display:block;border:0;outline:none;width:1px;height:1px;" />`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${img}</body>`);
  return html + img;
}

export async function injectTracking(
  html: string, campaignId: string, recipientId: string,
): Promise<string> {
  const withLinks = await rewriteLinksForTracking(html, campaignId, recipientId);
  return await appendTrackingPixel(withLinks, campaignId, recipientId);
}
