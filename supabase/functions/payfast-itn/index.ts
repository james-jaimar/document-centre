// PayFast Instant Transaction Notification handler.
// Single fixed URL: tenant/branch resolved via the m_payment_id (= attempt_id).
import { adminClient, readSecret } from "../_shared/payments.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  const data: Record<string, string> = {};
  for (const [k, v] of params.entries()) data[k] = v;

  const attemptId = data["m_payment_id"];
  if (!attemptId) return new Response("Missing m_payment_id", { status: 400 });

  const sb = adminClient();
  const { data: attempt } = await sb
    .from("order_payment_attempts")
    .select("id, order_id, tenant_id, branch_id, amount, currency")
    .eq("id", attemptId)
    .eq("provider", "payfast")
    .maybeSingle();
  if (!attempt) return new Response("Attempt not found", { status: 404 });

  // Resolve credentials (branch override -> tenant)
  let secretId: string | null = null;
  if (attempt.branch_id) {
    const { data: bpg } = await sb.from("branch_payment_gateways")
      .select("credentials_secret_id")
      .eq("branch_id", attempt.branch_id).eq("provider", "payfast").maybeSingle();
    if (bpg?.credentials_secret_id) secretId = bpg.credentials_secret_id;
  }
  if (!secretId) {
    const { data: tpg } = await sb.from("tenant_payment_gateways")
      .select("credentials_secret_id")
      .eq("tenant_id", attempt.tenant_id).eq("provider", "payfast").maybeSingle();
    secretId = tpg?.credentials_secret_id ?? null;
  }
  if (!secretId) return new Response("Credentials not configured", { status: 400 });
  const creds = await readSecret(secretId);
  if (!creds) return new Response("Credentials missing", { status: 500 });

  // Validate signature
  const sigReceived = data["signature"];
  const expected = payfastSignature(data, creds.passphrase || "");
  if (sigReceived?.toLowerCase() !== expected.toLowerCase()) {
    console.warn("PayFast ITN signature mismatch", { attemptId });
    return new Response("Invalid signature", { status: 400 });
  }

  // Validate amount
  const reportedAmount = Number(data["amount_gross"] ?? "0");
  if (Math.abs(reportedAmount - Number(attempt.amount)) > 0.01) {
    console.warn("PayFast amount mismatch", { attemptId, reportedAmount, expected: attempt.amount });
    return new Response("Amount mismatch", { status: 400 });
  }

  const status = data["payment_status"];
  if (status === "COMPLETE") {
    await sb.from("order_payment_attempts").update({
      status: "succeeded",
      provider_session_id: data["pf_payment_id"] ?? null,
      raw_payload: data,
    }).eq("id", attemptId);

    await sb.from("orders").update({
      payment_status: "paid",
      amount_paid: reportedAmount,
      amount_due: 0,
    }).eq("id", attempt.order_id);
  } else if (status === "FAILED") {
    await sb.from("order_payment_attempts").update({
      status: "failed", raw_payload: data,
    }).eq("id", attemptId);
  } else if (status === "CANCELLED") {
    await sb.from("order_payment_attempts").update({
      status: "cancelled", raw_payload: data,
    }).eq("id", attemptId);
  }

  return new Response("ok", { status: 200 });
});

function payfastSignature(fields: Record<string, string>, passphrase: string): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (k === "signature" || v === "" || v == null) continue;
    parts.push(`${k}=${encodeURIComponent(v).replace(/%20/g, "+")}`);
  }
  let payload = parts.join("&");
  if (passphrase) payload += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`;
  return md5(payload);
}

// MD5 (RFC 1321)
function md5(input: string): string {
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
