// Generates a branded invoice PDF for an order, stores it, and records it in order_invoices.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fmtMoney = (n: number, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 2 }).format(n || 0);

function getTenantSetting(settings: any[], category: string, key: string): any {
  return settings.find((s) => s.category === category && s.setting_key === key)?.setting_value ?? null;
}

async function buildPdf(opts: {
  invoiceNumber: string;
  kind: string;
  order: any;
  jobs: any[];
  tenant: any;
  branding: Record<string, any>;
  financial: Record<string, any>;
  bank: Record<string, any>;
  billingAddress: any | null;
  deliveryAddress: any | null;
}): Promise<Uint8Array> {
  const { invoiceNumber, kind, order, jobs, tenant, branding, financial, bank, billingAddress, deliveryAddress } = opts;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4 portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595;
  const M = 40;
  let y = 800;

  const text = (t: string, x: number, yy: number, opts: any = {}) => {
    page.drawText(String(t ?? ""), {
      x,
      y: yy,
      size: opts.size ?? 10,
      font: opts.bold ? fontBold : font,
      color: opts.color ?? rgb(0.1, 0.1, 0.15),
      maxWidth: opts.maxWidth,
    });
  };

  // Header band
  const primaryHex = (branding.primary_color as string) || "#1a1a2e";
  const c = hexToRgb(primaryHex);
  page.drawRectangle({ x: 0, y: 780, width: W, height: 62, color: rgb(c.r, c.g, c.b) });
  text(branding.portal_name || tenant.trading_name || tenant.name, M, 815, { size: 18, bold: true, color: rgb(1, 1, 1) });
  text(kind === "credit_note" ? "CREDIT NOTE" : kind === "proforma" ? "PROFORMA INVOICE" : "TAX INVOICE", W - M - 130, 815, { size: 14, bold: true, color: rgb(1, 1, 1) });

  y = 760;

  // Tenant / from block
  const fromLines = [
    tenant.legal_name || tenant.name,
    tenant.vat_number ? `VAT: ${tenant.vat_number}` : "",
    tenant.registration_number ? `Reg: ${tenant.registration_number}` : "",
    tenant.support_email || "",
    tenant.support_phone || "",
  ].filter(Boolean);
  fromLines.forEach((line, i) => text(line, M, y - i * 12, { size: 9 }));

  // Invoice meta block right
  const meta = [
    [`Invoice No:`, invoiceNumber],
    [`Order No:`, order.order_number || order.id.slice(0, 8)],
    [`Date:`, new Date().toLocaleDateString("en-ZA")],
    [`Currency:`, order.currency || "ZAR"],
  ];
  meta.forEach(([k, v], i) => {
    text(k, W - M - 180, y - i * 12, { size: 9, bold: true });
    text(v, W - M - 100, y - i * 12, { size: 9 });
  });

  y -= Math.max(fromLines.length, meta.length) * 12 + 18;

  // Bill to / Ship to
  const billY = y;
  text("Bill To", M, billY, { bold: true, size: 10 });
  const billLines = billingAddress
    ? [
        billingAddress.contact_name,
        billingAddress.company_name,
        billingAddress.line1,
        billingAddress.line2,
        [billingAddress.suburb, billingAddress.city].filter(Boolean).join(", "),
        [billingAddress.postal_code, billingAddress.province].filter(Boolean).join(" "),
        billingAddress.email,
      ].filter(Boolean)
    : [order.customer_name, order.customer_email].filter(Boolean);
  billLines.forEach((l: string, i: number) => text(l, M, billY - 14 - i * 11, { size: 9 }));

  if (deliveryAddress) {
    text("Ship To", W / 2, billY, { bold: true, size: 10 });
    const dLines = [
      deliveryAddress.contact_name,
      deliveryAddress.company_name,
      deliveryAddress.line1,
      deliveryAddress.line2,
      [deliveryAddress.suburb, deliveryAddress.city].filter(Boolean).join(", "),
      [deliveryAddress.postal_code, deliveryAddress.province].filter(Boolean).join(" "),
    ].filter(Boolean);
    dLines.forEach((l: string, i: number) => text(l, W / 2, billY - 14 - i * 11, { size: 9 }));
  }

  y = billY - 14 - Math.max(billLines.length, deliveryAddress ? 7 : 0) * 11 - 18;

  // Items table header
  page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 18, color: rgb(0.93, 0.94, 0.97) });
  text("Description", M + 6, y, { bold: true, size: 9 });
  text("Qty", W - M - 180, y, { bold: true, size: 9 });
  text("Unit", W - M - 130, y, { bold: true, size: 9 });
  text("Total", W - M - 60, y, { bold: true, size: 9 });
  y -= 22;

  for (const job of jobs) {
    if (y < 180) {
      // simplistic page break
      const np = pdf.addPage([595, 842]);
      // continue on new page
      y = 800;
    }
    const qty = Number(job.quantity || 0);
    const unit = qty > 0 ? Number(job.net_price || 0) / qty : Number(job.net_price || 0);
    text(job.product_name + (job.job_name ? ` — ${job.job_name}` : ""), M + 6, y, { size: 9, maxWidth: W - 2 * M - 200 });
    text(String(qty), W - M - 180, y, { size: 9 });
    text(fmtMoney(unit, order.currency), W - M - 140, y, { size: 9 });
    text(fmtMoney(Number(job.net_price), order.currency), W - M - 70, y, { size: 9 });
    y -= 16;
    // configuration summary line (small)
    const summary = (job.configuration as any)?.summary;
    if (summary) {
      const chips: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const lbl = summary[`primary_spec_${i}_label`];
        const val = summary[`primary_spec_${i}_value`];
        if (lbl && val) chips.push(`${lbl}: ${val}`);
      }
      if (chips.length) {
        text(chips.join("  •  "), M + 6, y, { size: 8, color: rgb(0.4, 0.42, 0.5), maxWidth: W - 2 * M - 12 });
        y -= 14;
      }
    }
    y -= 4;
  }

  y -= 10;
  // Totals
  const tx = W - M - 180;
  const tv = W - M - 6;
  const totals: [string, number][] = [
    ["Subtotal", Number(order.subtotal)],
    ["Discount", -Number(order.discount_amount || 0)],
    ["Delivery", Number(order.delivery_amount || 0)],
    [`${(financial.tax_label as string) || "VAT"} (${financial.tax_rate ?? 15}%)`, Number(order.vat_amount)],
    ["Total", Number(order.total_amount)],
    ["Paid", Number(order.amount_paid || 0)],
    ["Amount Due", Number(order.amount_due || 0)],
  ];
  totals.forEach(([label, val], i) => {
    const isFinal = label === "Total" || label === "Amount Due";
    text(label, tx, y - i * 14, { bold: isFinal, size: isFinal ? 10 : 9 });
    const valStr = fmtMoney(val, order.currency);
    const w = (isFinal ? fontBold : font).widthOfTextAtSize(valStr, isFinal ? 10 : 9);
    text(valStr, tv - w, y - i * 14, { bold: isFinal, size: isFinal ? 10 : 9 });
  });

  y -= totals.length * 14 + 14;

  // Banking details
  if (kind !== "receipt" && (bank.bank_name || bank.account_number)) {
    if (y < 130) y = 130;
    page.drawRectangle({ x: M, y: y - 60, width: W - 2 * M, height: 60, borderColor: rgb(0.85, 0.85, 0.9), borderWidth: 0.5 });
    text("Banking Details (EFT)", M + 8, y - 12, { bold: true, size: 10 });
    const bankLines = [
      bank.bank_name && `Bank: ${bank.bank_name}`,
      bank.account_name && `Account name: ${bank.account_name}`,
      bank.account_number && `Account no: ${bank.account_number}`,
      bank.branch_code && `Branch code: ${bank.branch_code}`,
      `Reference: ${order.order_number}`,
    ].filter(Boolean) as string[];
    bankLines.forEach((l, i) => text(l, M + 8, y - 26 - i * 10, { size: 9 }));
  }

  // Footer
  text(
    `${tenant.legal_name || tenant.name} • Generated ${new Date().toLocaleString("en-ZA")}`,
    M,
    30,
    { size: 8, color: rgb(0.5, 0.5, 0.55) }
  );

  return pdf.save();
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = parseInt(v, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json();
    const { order_id, kind = "invoice" } = body || {};
    if (!order_id) return json({ error: "order_id required" }, 400);

    // Auth: must be staff for tenant OR the order owner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    // Load order + jobs + tenant + addresses + settings
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (oErr || !order) return json({ error: "Order not found" }, 404);

    const [{ data: jobs }, { data: addresses }, { data: tenant }, { data: settings }] = await Promise.all([
      admin.from("order_jobs").select("*").eq("order_id", order_id).order("sequence_no"),
      admin.from("order_addresses").select("*").eq("order_id", order_id),
      admin.from("tenants").select("*").eq("id", order.tenant_id).single(),
      admin.from("tenant_settings").select("*").eq("tenant_id", order.tenant_id),
    ]);

    const settingsArr = settings || [];
    const branding: Record<string, any> = {};
    const financial: Record<string, any> = {};
    const bank: Record<string, any> = {};
    settingsArr.forEach((s) => {
      if (s.category === "branding") branding[s.setting_key] = s.setting_value;
      if (s.category === "financial") financial[s.setting_key] = s.setting_value;
      if (s.category === "payments") bank[s.setting_key] = s.setting_value;
    });

    // Issue invoice number
    const { data: invNum, error: inErr } = await admin.rpc("issue_invoice_number", {
      p_tenant_id: order.tenant_id,
      p_app_id: order.app_id,
    });
    if (inErr || !invNum) return json({ error: `invoice number: ${inErr?.message}` }, 500);

    const billing = (addresses || []).find((a: any) => a.address_type === "billing") || null;
    const delivery = (addresses || []).find((a: any) => a.address_type === "delivery") || null;

    const pdfBytes = await buildPdf({
      invoiceNumber: invNum as string,
      kind,
      order,
      jobs: jobs || [],
      tenant,
      branding,
      financial,
      bank,
      billingAddress: billing,
      deliveryAddress: delivery,
    });

    const path = `invoices/${order.tenant_id}/${order.order_number || order.id}/${invNum}.pdf`;
    const upload = await admin.storage
      .from("documents")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upload.error) return json({ error: `upload: ${upload.error.message}` }, 500);

    // Insert order_invoices row
    const { data: inv, error: iErr } = await admin
      .from("order_invoices")
      .insert({
        app_id: order.app_id,
        tenant_id: order.tenant_id,
        order_id,
        invoice_number: invNum,
        kind,
        storage_bucket: "documents",
        storage_path: path,
        total_amount: order.total_amount,
        amount_paid: order.amount_paid,
        currency: order.currency,
      })
      .select("id")
      .single();
    if (iErr) return json({ error: `insert: ${iErr.message}` }, 500);

    // Mirror to order_documents so it shows in customer file list
    await admin.from("order_documents").insert({
      app_id: order.app_id,
      tenant_id: order.tenant_id,
      order_id,
      document_type: kind === "credit_note" ? "credit_note" : kind === "receipt" ? "receipt" : "invoice",
      title: `${kind === "credit_note" ? "Credit Note" : kind === "proforma" ? "Proforma Invoice" : kind === "receipt" ? "Receipt" : "Tax Invoice"} ${invNum}`,
      file_name: `${invNum}.pdf`,
      storage_bucket: "documents",
      storage_path: path,
      mime_type: "application/pdf",
      file_size_bytes: pdfBytes.byteLength,
      is_customer_visible: true,
      source_app_managed: true,
      created_by: u.user.id,
      metadata: { invoice_id: inv?.id, kind },
    });

    return json({ success: true, invoice_id: inv?.id, invoice_number: invNum, storage_path: path });
  } catch (e) {
    console.error("generate-invoice-pdf error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
