// Shared PayFast helpers — signing, encoding, and short-lived HMAC tokens
// for the redirect handoff. Used by:
//   - payments-create-session (mints the redirect token)
//   - payfast-redirect       (verifies the token, renders auto-submit form)
//   - payfast-itn            (verifies inbound notification signature)

export type PayfastMode = "test" | "live";

export const PAYFAST_HOSTS: Record<PayfastMode, string> = {
  test: "sandbox.payfast.co.za",
  live: "www.payfast.co.za",
};

export function payfastProcessUrl(mode: PayfastMode): string {
  return `https://${PAYFAST_HOSTS[mode]}/eng/process`;
}

export function payfastValidateUrl(mode: PayfastMode): string {
  return `https://${PAYFAST_HOSTS[mode]}/eng/query/validate`;
}

/**
 * PHP `urlencode` compatible encoder. PayFast's signature spec is based on
 * the PHP implementation, which differs from JS `encodeURIComponent`:
 *   - spaces become '+', not '%20'
 *   - ! * ' ( ) must be percent-encoded
 */
export function pfEncode(v: string): string {
  return encodeURIComponent(v)
    .replace(/%20/g, "+")
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/**
 * Signature for an OUTBOUND checkout form. Field order is fixed (PayFast docs:
 * "in the order in which they appear in the attributes description"). Blank
 * values are skipped. Passphrase is appended last when present.
 */
export function payfastSignFormPairs(
  pairs: Array<[string, string]>,
  passphrase: string,
): { signature: string; baseString: string } {
  const parts: string[] = [];
  for (const [k, v] of pairs) {
    if (k === "signature") continue;
    const t = (v ?? "").toString().trim();
    if (t === "") continue;
    parts.push(`${k}=${pfEncode(t)}`);
  }
  let baseString = parts.join("&");
  const pp = (passphrase ?? "").trim();
  if (pp) baseString += `&passphrase=${pfEncode(pp)}`;
  return { signature: md5(baseString), baseString };
}

/**
 * Signature for an INBOUND ITN. The spec says: concatenate fields in the
 * order they were posted, skip `signature`, append passphrase. Values are
 * URL-encoded with the same PHP-style rules.
 */
export function payfastSignITN(
  postedPairs: Array<[string, string]>,
  passphrase: string,
): string {
  const parts: string[] = [];
  for (const [k, v] of postedPairs) {
    if (k === "signature") break; // stop at signature (matches PHP example)
    const t = (v ?? "").toString();
    // ITN signature includes the value as PayFast posted it (no trim, no
    // blank-skipping like the outbound form). PHP example uses urlencode($val).
    parts.push(`${k}=${pfEncode(t)}`);
  }
  let baseString = parts.join("&");
  const pp = (passphrase ?? "").trim();
  if (pp) baseString += `&passphrase=${pfEncode(pp)}`;
  return md5(baseString);
}

// =========================================================================
// HMAC redirect token. Keeps `payfast-redirect` callable only by users who
// just came out of `payments-create-session` for a specific attempt, and
// keeps the window short so links can't be replayed days later.
// =========================================================================

const TOKEN_TTL_SECONDS = 10 * 60; // 10 minutes

function tokenSecret(): string {
  const s =
    Deno.env.get("PAYFAST_REDIRECT_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";
  if (!s) throw new Error("No HMAC secret available for redirect token");
  return s;
}

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const std = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return b64url(new Uint8Array(sig));
}

export async function mintRedirectToken(attemptId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${attemptId}.${exp}`;
  const sig = await hmac(payload, tokenSecret());
  return `${b64url(new TextEncoder().encode(payload))}.${sig}`;
}

export async function verifyRedirectToken(
  token: string,
): Promise<{ ok: true; attemptId: string } | { ok: false; reason: string }> {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return { ok: false, reason: "malformed" };
    const payload = new TextDecoder().decode(b64urlDecode(payloadB64));
    const [attemptId, expStr] = payload.split(".");
    if (!attemptId || !expStr) return { ok: false, reason: "malformed" };
    const expected = await hmac(payload, tokenSecret());
    if (expected !== sig) return { ok: false, reason: "bad_signature" };
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true, attemptId };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// =========================================================================
// MD5 (RFC 1321) — PayFast still requires it for signatures.
// =========================================================================
export function md5(input: string): string {
  function rh(n: number) { let s = "", j; for (j = 0; j <= 3; j++) s += ((n >> (j * 8 + 4)) & 0x0F).toString(16) + ((n >> (j * 8)) & 0x0F).toString(16); return s; }
  function ad(x: number, y: number) { const l = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xFFFF); }
  function rl(n: number, c: number) { return (n << c) | (n >>> (32 - c)); }
  function cm(q: number, a: number, b: number, x: number, s: number, t: number) { return ad(rl(ad(ad(a, q), ad(x, t)), s), b); }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cm(c ^ (b | (~d)), a, b, x, s, t); }
  function c2b(s: string) {
    const enc = new TextEncoder().encode(s);
    const nb = ((enc.length + 8) >> 6) + 1;
    const b: number[] = new Array(nb * 16).fill(0);
    for (let i = 0; i < enc.length; i++) b[i >> 2] |= enc[i] << ((i % 4) * 8);
    b[enc.length >> 2] |= 0x80 << ((enc.length % 4) * 8);
    b[nb * 16 - 2] = enc.length * 8;
    return b;
  }
  const x = c2b(input);
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[i + 0], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586); c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426); c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417); c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101); c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632); c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i + 0], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083); c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690); c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784); c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463); c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353); c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i + 0], 11, -358537222); c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835); c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = ii(a, b, c, d, x[i + 0], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415); c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606); c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744); c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379); c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = ad(a, oa); b = ad(b, ob); c = ad(c, oc); d = ad(d, od);
  }
  return rh(a) + rh(b) + rh(c) + rh(d);
}
