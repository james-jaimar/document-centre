import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  corsHeaders,
  userClient,
  adminClient,
  resolveGatewaysForOrder,
  readSecret,
} from "../_shared/payments.ts";

const BodySchema = z.object({
  order_id: z.string().uuid(),
  provider: z.enum(["stripe", "payfast"]),
  return_url: z.string().url(),
  cancel_url: z.string().url(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const sbUser = userClient(authHeader);
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { order_id, provider, return_url, cancel_url } = parsed.data;

  // Confirm order is visible to this user via RLS.
  const { data: ownedOrder } = await sbUser.from("orders").select("id, branch_id, tenant_id").eq("id", order_id).maybeSingle();
  if (!ownedOrder) return json({ error: "Forbidden" }, 403);

  // Branch subscription gate — block new payment sessions for read-only branches.
  if (ownedOrder.branch_id) {
    const sbAdmin = adminClient();
    const [{ data: roleRow }, { data: tmRow }, { data: subRow }] = await Promise.all([
      sbAdmin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle(),
      sbAdmin.from("tenant_memberships").select("role").eq("profile_id", user.id).eq("tenant_id", ownedOrder.tenant_id).eq("is_active", true).in("role", ["owner", "admin"]).maybeSingle(),
      sbAdmin.from("branch_subscriptions").select("status,billing_status").eq("branch_id", ownedOrder.branch_id).maybeSingle(),
    ]);
    const bypass = !!roleRow || !!tmRow;
    if (!bypass) {
      const status = subRow?.status || "";
      const billing = subRow?.billing_status || "";
      const ok = status === "active" || status === "trialing" || billing === "paid" || billing === "free";
      if (!ok) {
        return json({ error: "This branch's subscription is not active. Payments are paused.", code: "branch_subscription_blocked" }, 402);
      }
    }
  }

  const { order, gateways } = await resolveGatewaysForOrder(order_id);

  const gw = gateways.find((g) => g.provider === provider);
  if (!gw) return json({ error: `Provider ${provider} not enabled or not configured` }, 400);

  const creds = await readSecret(gw.secretId);
  if (!creds) return json({ error: "Credentials missing" }, 500);

  const sb = adminClient();
  const amount = Number(order.amount_due) > 0 ? Number(order.amount_due) : Number(order.total_amount);
  if (!amount || amount <= 0) return json({ error: "Order has no amount due" }, 400);

  // Insert pending attempt up-front so the webhook/ITN can find it.
  const { data: attempt, error: attemptErr } = await sb
    .from("order_payment_attempts")
    .insert({
      order_id,
      tenant_id: order.tenant_id,
      app_id: order.app_id,
      branch_id: gw.branchId ?? order.branch_id,
      provider,
      status: "pending",
      amount,
      currency: order.currency || "ZAR",
    })
    .select()
    .single();
  if (attemptErr || !attempt) return json({ error: "Failed to create attempt" }, 500);

  if (provider === "stripe") {
    if (!creds.secret_key) return json({ error: "Stripe secret_key missing" }, 500);
    const stripe = new Stripe(creds.secret_key, { apiVersion: "2023-10-16" });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: (order.currency || "ZAR").toLowerCase(),
          product_data: { name: `Order ${order.order_number || order.id.slice(0, 8)}` },
          unit_amount: Math.round(amount * 100),
        },
      }],
      success_url: return_url,
      cancel_url,
      metadata: {
        order_id,
        attempt_id: attempt.id,
        tenant_id: order.tenant_id,
      },
    });

    await sb
      .from("order_payment_attempts")
      .update({ provider_session_id: session.id })
      .eq("id", attempt.id);

    return json({ redirect_url: session.url });
  }

  // PayFast
  if (!creds.merchant_id || !creds.merchant_key) {
    return json({ error: "PayFast credentials incomplete" }, 500);
  }

  const isSandbox = gw.mode === "test";
  const action = isSandbox
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";

  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  const itnUrl = `${projectUrl}/functions/v1/payfast-itn`;

  const fields: Record<string, string> = {
    merchant_id: creds.merchant_id,
    merchant_key: creds.merchant_key,
    return_url,
    cancel_url,
    notify_url: itnUrl,
    m_payment_id: attempt.id,
    amount: amount.toFixed(2),
    item_name: `Order ${order.order_number || order.id.slice(0, 8)}`,
  };
  // Signature
  const signature = payfastSignature(fields, creds.passphrase || "");
  fields.signature = signature;

  return json({ form_action: action, form_fields: fields });
});

function payfastSignature(fields: Record<string, string>, passphrase: string): string {
  // PayFast: build query string in the order fields are added (excluding 'signature'),
  // url-encode values (spaces -> '+'), append passphrase, MD5.
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (k === "signature" || v === "" || v == null) continue;
    parts.push(`${k}=${encodeURIComponent(v).replace(/%20/g, "+")}`);
  }
  let payload = parts.join("&");
  if (passphrase) payload += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`;
  return md5(payload);
}

// Tiny MD5 implementation (RFC 1321) — PayFast still requires it.
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
