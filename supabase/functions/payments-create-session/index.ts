import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  corsHeaders,
  userClient,
  adminClient,
  resolveGatewaysForOrder,
  readSecret,
} from "../_shared/payments.ts";
import { mintRedirectToken } from "../_shared/payfast.ts";

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
  // Stash the user's return/cancel URLs on raw_payload.handoff so the
  // server-rendered payfast-redirect page can rebuild the form without
  // exposing them in the URL we hand to the browser.
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
      raw_payload: {
        handoff: { return_url, cancel_url },
      },
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

  // PayFast — hand off via the server-rendered redirect page on Supabase.
  // The browser navigates with a plain GET; CSP form-action on the app
  // domain is irrelevant because the cross-origin POST originates from
  // *.supabase.co.
  if (!creds.merchant_id || !creds.merchant_key) {
    return json({ error: "PayFast credentials incomplete" }, 500);
  }

  const token = await mintRedirectToken(attempt.id);
  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  const redirectUrl = `${projectUrl}/functions/v1/payfast-redirect?token=${encodeURIComponent(token)}`;

  console.log("payfast.session", JSON.stringify({
    attempt_id: attempt.id,
    branch_id: gw.branchId ?? null,
    tenant_id: order.tenant_id,
    mode: gw.mode,
    merchant_id: creds.merchant_id,
    has_passphrase: !!(creds.passphrase || "").trim(),
    amount: amount.toFixed(2),
  }));

  return json({ redirect_url: redirectUrl });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
