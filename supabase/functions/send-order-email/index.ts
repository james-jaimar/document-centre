// Renders a branded transactional email for an order and enqueues it into
// email_outbox (which the email-dispatcher then sends via the tenant's SMTP).
// Idempotent on (order_id, event_key) — won't double-send.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { enqueueEmail } from "../_shared/email-queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type EventKey =
  | "order_received"
  | "payment_received"
  | "proof_ready"
  | "in_production"
  | "ready_for_collection"
  | "dispatched"
  | "completed"
  | "refunded";

const SUBJECTS: Record<EventKey, (n: string) => string> = {
  order_received: (n) => `Order ${n} received — thank you!`,
  payment_received: (n) => `Payment received for order ${n}`,
  proof_ready: (n) => `Proof ready for order ${n}`,
  in_production: (n) => `Order ${n} is now in production`,
  ready_for_collection: (n) => `Order ${n} is ready for collection`,
  dispatched: (n) => `Order ${n} has been dispatched`,
  completed: (n) => `Order ${n} is complete`,
  refunded: (n) => `Refund processed for order ${n}`,
};

const HEADLINES: Record<EventKey, string> = {
  order_received: "Thanks for your order!",
  payment_received: "Payment received",
  proof_ready: "Your proof is ready to review",
  in_production: "Your order is now in production",
  ready_for_collection: "Your order is ready",
  dispatched: "Your order has been dispatched",
  completed: "Your order is complete",
  refunded: "A refund has been processed",
};

const BODIES: Record<EventKey, (ctx: any) => string> = {
  order_received: (c) =>
    `We've received your order <strong>${c.orderNo}</strong> for ${c.totalFmt}. ${
      c.unpaid ? `Please pay via EFT using the banking details below — use <strong>${c.orderNo}</strong> as your reference.` : "Your payment has been recorded."
    }`,
  payment_received: (c) => `We've received your payment of ${c.totalFmt} for order <strong>${c.orderNo}</strong>. We'll get started right away.`,
  proof_ready: (c) => `A proof for order <strong>${c.orderNo}</strong> is ready for your review. Please log in to approve it.`,
  in_production: (c) => `Order <strong>${c.orderNo}</strong> has moved into production. We'll let you know when it's ready.`,
  ready_for_collection: (c) => `Order <strong>${c.orderNo}</strong> is ready for collection from our store.`,
  dispatched: (c) => `Order <strong>${c.orderNo}</strong> is on its way. ${c.deliveryLine ?? ""}`,
  completed: (c) => `Order <strong>${c.orderNo}</strong> is complete. Thank you for your business!`,
  refunded: (c) => `A refund of ${c.refundFmt ?? c.totalFmt} has been processed for order <strong>${c.orderNo}</strong>.`,
};

function renderHtml(opts: {
  branding: any;
  tenant: any;
  bank: any;
  event: EventKey;
  ctx: any;
  ctaUrl?: string;
}) {
  const primary = (opts.branding.primary_color as string) || "#1a1a2e";
  const portalName = (opts.branding.portal_name as string) || opts.tenant.trading_name || opts.tenant.name;
  const logo = opts.branding.logo_url as string | undefined;
  const headline = HEADLINES[opts.event];
  const body = BODIES[opts.event](opts.ctx);
  const showBank = opts.event === "order_received" && opts.ctx.unpaid && (opts.bank.bank_name || opts.bank.account_number);
  const bankBlock = showBank
    ? `<table style="margin-top:18px;border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;width:100%">
        <tr><td style="padding:12px 14px"><strong style="display:block;margin-bottom:6px;font-size:13px">Banking details (EFT)</strong>
          <div style="font-size:13px;line-height:1.6;color:#374151">
            ${opts.bank.bank_name ? `Bank: ${opts.bank.bank_name}<br>` : ""}
            ${opts.bank.account_name ? `Account name: ${opts.bank.account_name}<br>` : ""}
            ${opts.bank.account_number ? `Account no: ${opts.bank.account_number}<br>` : ""}
            ${opts.bank.branch_code ? `Branch code: ${opts.bank.branch_code}<br>` : ""}
            <strong>Reference: ${opts.ctx.orderNo}</strong>
          </div>
        </td></tr>
       </table>`
    : "";
  const cta = opts.ctaUrl
    ? `<p style="margin:22px 0"><a href="${opts.ctaUrl}" style="background:${primary};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block">View order</a></p>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:24px 0">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
          <tr><td style="background:${primary};padding:18px 24px">
            ${logo ? `<img src="${logo}" alt="${portalName}" style="max-height:36px;display:block">` : `<div style="color:#fff;font-size:18px;font-weight:600">${portalName}</div>`}
          </td></tr>
          <tr><td style="padding:28px 28px 8px">
            <h1 style="margin:0 0 12px;font-size:20px;color:#111827">${headline}</h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151">${body}</p>
            ${cta}
            ${bankBlock}
          </td></tr>
          <tr><td style="padding:18px 28px 28px;font-size:12px;color:#6b7280;border-top:1px solid #f0f1f4;margin-top:18px">
            <p style="margin:0">${opts.tenant.legal_name || opts.tenant.name}${opts.tenant.support_email ? ` &middot; <a href="mailto:${opts.tenant.support_email}" style="color:${primary}">${opts.tenant.support_email}</a>` : ""}${opts.tenant.support_phone ? ` &middot; ${opts.tenant.support_phone}` : ""}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json();
    const { order_id, event_key, force = false } = body || {};
    if (!order_id || !event_key) return json({ error: "order_id and event_key required" }, 400);

    const eventKey = event_key as EventKey;
    if (!SUBJECTS[eventKey]) return json({ error: `Unknown event_key: ${event_key}` }, 400);

    // Idempotency
    if (!force) {
      const { data: existing } = await admin
        .from("email_log")
        .select("id")
        .eq("order_id", order_id)
        .eq("event_key", eventKey)
        .eq("status", "sent")
        .maybeSingle();
      if (existing) return json({ success: true, skipped: true, reason: "already_sent" });
    }

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (oErr || !order) return json({ error: "Order not found" }, 404);
    if (!order.customer_email) return json({ success: true, skipped: true, reason: "no_email" });

    const [{ data: tenant }, { data: settings }, { data: addresses }] = await Promise.all([
      admin.from("tenants").select("*").eq("id", order.tenant_id).single(),
      admin.from("tenant_settings").select("*").eq("tenant_id", order.tenant_id),
      admin.from("order_addresses").select("*").eq("order_id", order_id),
    ]);

    const branding: any = {}, notif: any = {}, bank: any = {};
    (settings || []).forEach((s: any) => {
      if (s.category === "branding") branding[s.setting_key] = s.setting_value;
      if (s.category === "notifications") notif[s.setting_key] = s.setting_value;
      if (s.category === "payments") bank[s.setting_key] = s.setting_value;
    });

    // Per-tenant event toggle (default: on)
    const enabledMap: Record<EventKey, string> = {
      order_received: "order_confirmation",
      payment_received: "payment_received",
      proof_ready: "proof_ready",
      in_production: "in_production",
      ready_for_collection: "ready_for_collection",
      dispatched: "order_dispatched",
      completed: "order_completed",
      refunded: "refunded",
    };
    const settingKey = enabledMap[eventKey];
    if (notif[settingKey] === false) {
      await admin.from("email_log").insert({
        app_id: order.app_id, tenant_id: order.tenant_id, order_id,
        event_key: eventKey, recipient_email: order.customer_email,
        subject: SUBJECTS[eventKey](order.order_number || ""),
        status: "skipped", error_message: "tenant_disabled_event",
      });
      return json({ success: true, skipped: true, reason: "tenant_disabled" });
    }

    const fmtMoney = (n: number) =>
      new Intl.NumberFormat("en-ZA", { style: "currency", currency: order.currency || "ZAR" }).format(Number(n) || 0);

    const delivery = (addresses || []).find((a: any) => a.address_type === "delivery");
    const deliveryLine = delivery?.line1
      ? `Shipping to ${[delivery.line1, delivery.suburb, delivery.city].filter(Boolean).join(", ")}.`
      : "";

    const ctx = {
      orderNo: order.order_number || order.id.slice(0, 8),
      totalFmt: fmtMoney(order.total_amount),
      unpaid: order.payment_status === "unpaid",
      deliveryLine,
      refundFmt: body.refund_amount != null ? fmtMoney(body.refund_amount) : undefined,
    };

    const subject = SUBJECTS[eventKey](ctx.orderNo);
    const ctaUrl = tenant?.slug ? `https://document-centre.lovable.app/t/${tenant.slug}/orders/${order_id}` : undefined;
    const html = renderHtml({ branding, tenant, bank, event: eventKey, ctx, ctaUrl });

    const senderName = (notif.sender_name as string) || tenant.trading_name || tenant.name || "Orders";
    const smtpUser = Deno.env.get("SMTP_USER")!;
    const senderEmail = (notif.sender_email as string) || smtpUser;

    const client = new SMTPClient({
      connection: {
        hostname: Deno.env.get("SMTP_HOST")!,
        port: Number(Deno.env.get("SMTP_PORT")!),
        tls: true,
        auth: { username: smtpUser, password: Deno.env.get("SMTP_PASS")! },
      },
    });

    try {
      await client.send({
        from: `${senderName} <${senderEmail}>`,
        to: order.customer_email,
        replyTo: tenant.support_email || senderEmail,
        subject,
        html,
        content: "auto",
      });
      await client.close();
    } catch (sendErr: any) {
      await admin.from("email_log").insert({
        app_id: order.app_id, tenant_id: order.tenant_id, order_id,
        event_key: eventKey, recipient_email: order.customer_email,
        subject, status: "failed", error_message: sendErr.message,
      });
      return json({ error: `smtp: ${sendErr.message}` }, 500);
    }

    await admin.from("email_log").insert({
      app_id: order.app_id, tenant_id: order.tenant_id, order_id,
      event_key: eventKey, recipient_email: order.customer_email,
      subject, status: "sent",
    });

    return json({ success: true });
  } catch (e) {
    console.error("send-order-email error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
