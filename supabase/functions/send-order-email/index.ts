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
  | "refunded"
  | "order_cancelled"
  | "invoice_sent"
  | "payment_request";

const SUBJECTS: Record<EventKey, (n: string, extra?: any) => string> = {
  order_received: (n) => `Order ${n} received — thank you!`,
  payment_received: (n) => `Payment received for order ${n}`,
  proof_ready: (n) => `Proof ready for order ${n}`,
  in_production: (n) => `Order ${n} is now in production`,
  ready_for_collection: (n) => `Order ${n} is ready for collection`,
  dispatched: (n) => `Order ${n} has been dispatched`,
  completed: (n) => `Order ${n} is complete`,
  refunded: (n) => `Refund processed for order ${n}`,
  order_cancelled: (n) => `Order ${n} has been cancelled`,
  invoice_sent: (n, e) => `${e?.invoiceLabel || "Invoice"} for order ${n}`,
  payment_request: (n) => `Payment request for order ${n}`,
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
  order_cancelled: "Your order has been cancelled",
  invoice_sent: "Your invoice is attached",
  payment_request: "Payment required",
};

const KIND_LABEL: Record<string, string> = {
  proforma: "Proforma Invoice",
  invoice: "Tax Invoice",
  credit_note: "Credit Note",
  receipt: "Receipt",
};

const BODIES: Record<EventKey, (ctx: any) => string> = {
  order_received: (c) =>
    `We've received your order <strong>${c.orderNo}</strong> for ${c.totalFmt}. ${
      c.unpaid ? `Please pay via EFT using the banking details below — use <strong>${c.orderNo}</strong> as your reference.` : "Your payment has been recorded."
    }${c.hasProforma ? `<br><br>Your proforma invoice (<strong>${c.invoiceNumber}</strong>) is attached for your records.` : ""}`,
  payment_received: (c) =>
    `We've received your payment of ${c.totalFmt} for order <strong>${c.orderNo}</strong>. We'll get started right away.` +
    (c.hasAttachment ? `<br><br>Your ${c.invoiceLabel.toLowerCase()} (<strong>${c.invoiceNumber}</strong>) is attached for your records.` : ""),

  proof_ready: (c) => `A proof for order <strong>${c.orderNo}</strong> is ready for your review. Please log in to approve it.`,
  in_production: (c) => `Order <strong>${c.orderNo}</strong> has moved into production. We'll let you know when it's ready.`,
  ready_for_collection: (c) => `Order <strong>${c.orderNo}</strong> is ready for collection from our store.`,
  dispatched: (c) => `Order <strong>${c.orderNo}</strong> is on its way. ${c.deliveryLine ?? ""}`,
  completed: (c) => `Order <strong>${c.orderNo}</strong> is complete. Thank you for your business!`,
  refunded: (c) => `A refund of ${c.refundFmt ?? c.totalFmt} has been processed for order <strong>${c.orderNo}</strong>.`,
  order_cancelled: (c) =>
    `Order <strong>${c.orderNo}</strong> has been cancelled.${c.reason ? ` Reason: ${c.reason}.` : ""}${
      c.refundPending ? " Any payment received will be refunded separately." : ""
    } If you have any questions, please get in touch.`,
  invoice_sent: (c) =>
    `Please find your <strong>${c.invoiceLabel}</strong> (<strong>${c.invoiceNumber}</strong>) for order <strong>${c.orderNo}</strong> attached.` +
    `<br><br>Total: <strong>${c.totalFmt}</strong>` +
    (c.unpaid ? `<br>Amount due: <strong>${c.amountDueFmt}</strong>` : "") +
    (c.unpaid ? `<br><br>Please pay via EFT using <strong>${c.orderNo}</strong> as your reference.` : ""),
  payment_request: (c) =>
    `A payment of <strong>${c.amountDueFmt}</strong> is due for order <strong>${c.orderNo}</strong>.` +
    (c.hasAttachment ? `<br><br>Your proforma invoice (<strong>${c.invoiceNumber}</strong>) is attached.` : "") +
    `<br><br>Please pay via EFT using <strong>${c.orderNo}</strong> as your reference.`,

};

const DEFAULT_ORIGIN = "https://document-centre.com";

function resolveTenantOrigin(tenant: any): string {
  const raw = (tenant?.custom_domain as string | undefined)?.trim();
  if (!raw) return DEFAULT_ORIGIN;
  const stripped = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!stripped) return DEFAULT_ORIGIN;
  return `https://${stripped}`;
}

function absolutiseUrl(url: string | undefined | null, origin: string = DEFAULT_ORIGIN): string | undefined {
  if (!url) return undefined;
  const trimmed = String(url).trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/${trimmed}`;
}

// Many email clients (Gmail in particular) strip or fail to render SVG
// <img> tags. Pick an email-safe raster logo URL: prefer an explicit
// `email_logo_url` branding setting (PNG/JPG/WebP); otherwise use the main
// logo only if it's already a raster format. SVG-only logos fall back to
// the portal name as text rather than a broken/proxied image.
function pickEmailLogo(branding: any, origin: string): string | undefined {
  const isRaster = (u: string) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);
  const emailLogo = absolutiseUrl(branding.email_logo_url as string | undefined, origin);
  if (emailLogo && isRaster(emailLogo)) return emailLogo;
  const main = absolutiseUrl(branding.logo_url as string | undefined, origin);
  if (main && isRaster(main)) return main;
  return undefined;
}

function renderHtml(opts: {
  branding: any;
  tenant: any;
  branch: any;
  bank: any;
  event: EventKey;
  ctx: any;
  ctaUrl?: string;
}) {
  const primary = (opts.branding.primary_color as string) || "#1a1a2e";
  const portalName = (opts.branding.portal_name as string) || opts.tenant.trading_name || opts.tenant.name;
  const origin = resolveTenantOrigin(opts.tenant);
  const logo = pickEmailLogo(opts.branding, origin);
  const headline = HEADLINES[opts.event];
  const body = BODIES[opts.event](opts.ctx);
  const showBank =
    ((opts.event === "order_received" && opts.ctx.unpaid) ||
      opts.event === "payment_request" ||
      (opts.event === "invoice_sent" && opts.ctx.unpaid)) &&
    (opts.bank.bank_name || opts.bank.account_number);
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

  const footerName = opts.branch?.name || opts.tenant.legal_name || opts.tenant.name;
  const footerEmail =
    opts.branch?.email ||
    opts.branch?.billing_email ||
    opts.branch?.accounts_email ||
    opts.tenant.support_email;
  const footerPhone = opts.branch?.phone || opts.tenant.support_phone;

  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:24px 0">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
          <tr><td style="background:#ffffff;padding:18px 24px;border-bottom:1px solid #f0f1f4">
            ${logo ? `<img src="${logo}" alt="${portalName}" style="max-width:180px;max-height:48px;width:auto;height:auto;display:block;border:0;outline:none;text-decoration:none">` : `<div style="color:${primary};font-size:18px;font-weight:600">${portalName}</div>`}
          </td></tr>
          <tr><td style="padding:28px 28px 8px">
            <h1 style="margin:0 0 12px;font-size:20px;color:#111827">${headline}</h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151">${body}</p>
            ${cta}
            ${bankBlock}
          </td></tr>
          <tr><td style="padding:18px 28px 28px;font-size:12px;color:#6b7280;border-top:1px solid #f0f1f4;margin-top:18px">
            <p style="margin:0">${footerName}${footerEmail ? ` &middot; <a href="mailto:${footerEmail}" style="color:${primary}">${footerEmail}</a>` : ""}${footerPhone ? ` &middot; ${footerPhone}` : ""}</p>
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
    const { order_id, event_key, force = false, invoice_id } = body || {};
    if (!order_id || !event_key) return json({ error: "order_id and event_key required" }, 400);

    const eventKey = event_key as EventKey;
    if (!SUBJECTS[eventKey]) return json({ error: `Unknown event_key: ${event_key}` }, 400);

    // Idempotency
    if (!force) {
      const { data: existing } = await admin
        .from("email_outbox")
        .select("id")
        .eq("related_type", "order")
        .eq("related_id", order_id)
        .eq("status", "sent")
        .contains("metadata", { event_key: eventKey })
        .maybeSingle();
      if (existing) return json({ success: true, skipped: true, reason: "already_sent" });
    }

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (oErr || !order) return json({ error: "Order not found" }, 404);
    if ((order as any).is_demo) return json({ success: true, skipped: true, reason: "demo_order" });
    if (!order.customer_email) return json({ success: true, skipped: true, reason: "no_email" });

    // Resolve invoice to attach for events that should include a PDF.
    // Events that carry an attachment:
    //   - invoice_sent: explicit invoice_id passed in
    //   - order_received: proforma (passed in by order-engine)
    //   - payment_received: latest paid invoice/receipt
    //   - payment_request: latest proforma (auto-generate if none exists)
    let invoice: any = null;
    const ATTACH_EVENTS = new Set<EventKey>([
      "invoice_sent",
      "order_received",
      "payment_received",
      "payment_request",
    ]);

    if (ATTACH_EVENTS.has(eventKey)) {
      if (invoice_id) {
        const { data: inv } = await admin.from("order_invoices").select("*").eq("id", invoice_id).single();
        invoice = inv;
      } else {
        // Auto-resolve the most appropriate invoice for this order/event.
        let preferredKinds: string[] = [];
        if (eventKey === "payment_received") preferredKinds = ["receipt", "invoice"];
        else if (eventKey === "payment_request") preferredKinds = ["proforma"];
        else if (eventKey === "order_received") preferredKinds = ["proforma"];

        if (preferredKinds.length) {
          const { data: invRow } = await admin
            .from("order_invoices")
            .select("*")
            .eq("order_id", order_id)
            .in("kind", preferredKinds)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          invoice = invRow;

          // No proforma yet for a payment_request → generate one now.
          if (!invoice && eventKey === "payment_request") {
            try {
              const genRes = await fetch(
                `${Deno.env.get("SUPABASE_URL")!}/functions/v1/generate-invoice-pdf`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: req.headers.get("Authorization") || `Bearer ${serviceKey}`,
                  },
                  body: JSON.stringify({ order_id, kind: "proforma" }),
                },
              );
              if (genRes.ok) {
                const genData = await genRes.json().catch(() => null);
                const newId = (genData as any)?.invoice_id;
                if (newId) {
                  const { data: inv } = await admin
                    .from("order_invoices")
                    .select("*")
                    .eq("id", newId)
                    .single();
                  invoice = inv;
                }
              }
            } catch (e) {
              console.error("auto-generate proforma failed:", e);
            }
          }
        }
      }
    }


    const [{ data: tenant }, { data: settings }, { data: addresses }, { data: branch }] = await Promise.all([
      admin.from("tenants").select("*").eq("id", order.tenant_id).single(),
      admin.from("tenant_settings").select("*").eq("tenant_id", order.tenant_id),
      admin.from("order_addresses").select("*").eq("order_id", order_id),
      order.branch_id
        ? admin.from("branches").select("name, email, billing_email, accounts_email, phone").eq("id", order.branch_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const branding: any = {}, notif: any = {}, bank: any = {};
    (settings || []).forEach((s: any) => {
      if (s.category === "branding") branding[s.setting_key] = s.setting_value;
      if (s.category === "notifications") notif[s.setting_key] = s.setting_value;
      if (s.category === "payments") bank[s.setting_key] = s.setting_value;
    });

    // For standard events, check notification enable/disable settings
    const enabledMap: Record<string, string> = {
      order_received: "order_confirmation",
      payment_received: "payment_received",
      proof_ready: "proof_ready",
      in_production: "in_production",
      ready_for_collection: "ready_for_collection",
      dispatched: "order_dispatched",
      completed: "order_completed",
      refunded: "refunded",
      order_cancelled: "order_cancelled",
    };
    const settingKey = enabledMap[eventKey];
    if (settingKey && notif[settingKey] === false) {
      return json({ success: true, skipped: true, reason: "tenant_disabled" });
    }

    const fmtMoney = (n: number) =>
      new Intl.NumberFormat("en-ZA", { style: "currency", currency: order.currency || "ZAR" }).format(Number(n) || 0);

    const delivery = (addresses || []).find((a: any) => a.address_type === "delivery");
    const deliveryLine = delivery?.line1
      ? `Shipping to ${[delivery.line1, delivery.suburb, delivery.city].filter(Boolean).join(", ")}.`
      : "";

    const invoiceLabel = invoice ? (KIND_LABEL[invoice.kind] || invoice.kind) : "Invoice";

    const ctx = {
      orderNo: order.order_number || order.id.slice(0, 8),
      totalFmt: fmtMoney(order.total_amount),
      unpaid: order.payment_status === "unpaid",
      amountDueFmt: fmtMoney(order.amount_due),
      deliveryLine,
      refundFmt: body.refund_amount != null ? fmtMoney(body.refund_amount) : undefined,
      reason: body.reason || undefined,
      refundPending: body.refund_pending === true,
      invoiceLabel,
      invoiceNumber: invoice?.invoice_number || "",
      hasProforma: eventKey === "order_received" && !!invoice?.storage_path,
      hasAttachment: !!invoice?.storage_path,

    };

    const subject = SUBJECTS[eventKey](ctx.orderNo, ctx);
    const tenantOrigin = resolveTenantOrigin(tenant);
    const hasCustomDomain = tenantOrigin !== DEFAULT_ORIGIN;
    const ctaUrl =
      eventKey === "invoice_sent"
        ? undefined
        : hasCustomDomain
        ? `${tenantOrigin}/orders/${order_id}`
        : tenant?.slug
        ? `${DEFAULT_ORIGIN}/t/${tenant.slug}/orders/${order_id}`
        : undefined;
    const html = renderHtml({ branding, tenant, branch, bank, event: eventKey, ctx, ctaUrl });

    const senderName = (notif.sender_name as string) || tenant.trading_name || tenant.name || "Orders";
    const senderEmail = (notif.sender_email as string) || null;

    const attachments =
      ATTACH_EVENTS.has(eventKey) && invoice?.storage_bucket && invoice?.storage_path
        ? [{
            filename: `${invoice.invoice_number || "invoice"}.pdf`,
            storage_bucket: invoice.storage_bucket,
            storage_path: invoice.storage_path,
            content_type: "application/pdf",
          }]
        : undefined;


    await enqueueEmail(admin, {
      tenant_id: order.tenant_id,
      branch_id: order.branch_id ?? null,
      app_id: order.app_id,
      to: order.customer_email,
      subject,
      html,
      from_name: senderName,
      from_email: senderEmail ?? undefined,
      reply_to: tenant?.support_email ?? null,
      category: "order",
      related_type: "order",
      related_id: order_id,
      metadata: { event_key: eventKey, order_number: ctx.orderNo, ...(invoice_id ? { invoice_id } : {}) },
      attachments,
    });

    // Kick the dispatcher so the customer email goes out promptly.
    fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/email-dispatcher`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
    }).catch(() => {});

    return json({ success: true, queued: true });
  } catch (e) {
    console.error("send-order-email error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
