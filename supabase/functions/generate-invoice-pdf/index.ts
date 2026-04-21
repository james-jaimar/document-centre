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

function parseJsonArr(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
  }
  return [];
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = parseInt(v, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

// Color constants
const DARK_TEXT = rgb(0.1, 0.1, 0.12);
const MED_TEXT = rgb(0.35, 0.37, 0.42);
const LIGHT_TEXT = rgb(0.5, 0.52, 0.56);
const BORDER_COLOR = rgb(0.82, 0.84, 0.88);
const ROW_ALT = rgb(0.965, 0.97, 0.98);
const CARD_BG = rgb(0.96, 0.965, 0.975);
const WHITE = rgb(1, 1, 1);

const W = 595;
const H = 842;
const M = 44; // margin
const CW = W - 2 * M; // content width

interface PdfContext {
  pdf: any;
  font: any;
  fontBold: any;
  pages: any[];
  currentPage: any;
  y: number;
  primaryColor: { r: number; g: number; b: number };
  pageNum: number;
}

function ensureSpace(ctx: PdfContext, needed: number): void {
  if (ctx.y - needed < 60) {
    newPage(ctx);
  }
}

function newPage(ctx: PdfContext): void {
  const page = ctx.pdf.addPage([W, H]);
  ctx.pages.push(page);
  ctx.currentPage = page;
  ctx.y = H - 50;
  ctx.pageNum++;
}

function text(ctx: PdfContext, t: string, x: number, yy: number, opts: any = {}) {
  ctx.currentPage.drawText(String(t ?? ""), {
    x,
    y: yy,
    size: opts.size ?? 10,
    font: opts.bold ? ctx.fontBold : ctx.font,
    color: opts.color ?? DARK_TEXT,
    maxWidth: opts.maxWidth,
  });
}

function textWidth(ctx: PdfContext, t: string, size: number, bold = false) {
  return (bold ? ctx.fontBold : ctx.font).widthOfTextAtSize(String(t ?? ""), size);
}

function drawLine(ctx: PdfContext, x1: number, y: number, x2: number, color = BORDER_COLOR, thickness = 0.5) {
  ctx.currentPage.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

function drawRect(ctx: PdfContext, x: number, y: number, w: number, h: number, color: any) {
  ctx.currentPage.drawRectangle({ x, y, width: w, height: h, color });
}

function drawBorderedRect(ctx: PdfContext, x: number, y: number, w: number, h: number, opts: any = {}) {
  if (opts.fill) drawRect(ctx, x, y, w, h, opts.fill);
  ctx.currentPage.drawRectangle({
    x, y, width: w, height: h,
    borderColor: opts.borderColor ?? BORDER_COLOR,
    borderWidth: opts.borderWidth ?? 0.5,
    color: undefined,
  });
}

// Wrap long text into multiple lines
function wrapText(ctx: PdfContext, t: string, maxW: number, size: number, bold = false): string[] {
  const words = String(t ?? "").split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (textWidth(ctx, test, size, bold) > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
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
  docs: Record<string, any>;
  billingAddress: any | null;
  deliveryAddress: any | null;
}): Promise<Uint8Array> {
  const { invoiceNumber, kind, order, jobs, tenant, branding, financial, bank, docs, billingAddress, deliveryAddress } = opts;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const primaryHex = (branding.primary_color as string) || "#1a1a2e";
  const pc = hexToRgb(primaryHex);

  const ctx: PdfContext = { pdf, font, fontBold, pages: [], currentPage: null as any, y: 0, primaryColor: pc, pageNum: 0 };

  // First page
  newPage(ctx);
  ctx.y = H; // we'll draw from top

  // ─── HEADER BAND ───
  const HEADER_H = 70;
  const headerTop = H;
  const headerBot = H - HEADER_H;
  drawRect(ctx, 0, headerBot, W, HEADER_H, rgb(pc.r, pc.g, pc.b));

  // Subtle shadow strip below header
  drawRect(ctx, 0, headerBot - 3, W, 3, rgb(pc.r * 0.85, pc.g * 0.85, pc.b * 0.85));

  // Header left: logo or name
  const headerMode = (docs.header_mode as string) || "name";
  let logoEmbedded = false;
  if (headerMode === "logo" && docs.header_logo_url) {
    try {
      const logoRes = await fetch(docs.header_logo_url as string);
      if (logoRes.ok) {
        const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
        const contentType = logoRes.headers.get("content-type") || "";
        let logoImage;
        if (contentType.includes("png")) {
          logoImage = await pdf.embedPng(logoBytes);
        } else {
          logoImage = await pdf.embedJpg(logoBytes);
        }
        const logoH = 42;
        const logoW = (logoImage.width / logoImage.height) * logoH;
        const logoY = headerBot + (HEADER_H - logoH) / 2;
        ctx.currentPage.drawImage(logoImage, { x: M, y: logoY, width: logoW, height: logoH });
        logoEmbedded = true;
      }
    } catch { /* fall back to text */ }
  }
  if (!logoEmbedded) {
    const headerText = (headerMode === "name" && docs.header_name)
      ? (docs.header_name as string)
      : branding.portal_name || tenant.trading_name || tenant.name;
    const nameY = headerBot + (HEADER_H - 18) / 2;
    text(ctx, headerText, M, nameY, { size: 18, bold: true, color: WHITE });
  }

  // Header right: document title
  const docTitle = kind === "credit_note" ? "CREDIT NOTE"
    : kind === "proforma" ? ((docs.proforma_title as string) || "PROFORMA INVOICE")
    : ((docs.invoice_title as string) || "TAX INVOICE");
  const titleW = textWidth(ctx, docTitle, 14, true);
  const titleY = headerBot + (HEADER_H - 14) / 2;
  text(ctx, docTitle, W - M - titleW, titleY, { size: 14, bold: true, color: WHITE });

  ctx.y = headerBot - 3 - 18; // below shadow strip

  // ─── COMPANY INFO (left) + INVOICE META (right) ───
  const metaBoxW = 200;
  const metaBoxX = W - M - metaBoxW;
  const infoX = M;

  // From block
  const invoiceAddress = (docs.invoice_address as string) || "";
  const fromLines = invoiceAddress
    ? invoiceAddress.split("\n").map((l: string) => l.trim()).filter(Boolean)
    : [
        tenant.legal_name || tenant.name,
        tenant.vat_number ? `VAT: ${tenant.vat_number}` : "",
        tenant.registration_number ? `Reg: ${tenant.registration_number}` : "",
        tenant.support_email || "",
        tenant.support_phone || "",
      ].filter(Boolean);

  // Company name (first line bold, larger)
  if (fromLines.length > 0) {
    text(ctx, fromLines[0], infoX, ctx.y, { size: 11, bold: true });
    for (let i = 1; i < fromLines.length; i++) {
      text(ctx, fromLines[i], infoX, ctx.y - 14 - (i - 1) * 12, { size: 9, color: MED_TEXT });
    }
  }

  // Invoice meta box (right side)
  const meta = [
    ["Invoice No:", invoiceNumber],
    ["Order No:", order.order_number || order.id.slice(0, 8)],
    ["Date:", new Date().toLocaleDateString("en-ZA")],
    ["Currency:", order.currency || "ZAR"],
  ];
  const metaRowH = 18;
  const metaH = meta.length * metaRowH + 4;
  const metaTop = ctx.y + 6;
  drawBorderedRect(ctx, metaBoxX, metaTop - metaH, metaBoxW, metaH, { fill: CARD_BG });
  meta.forEach(([k, v], i) => {
    const rowY = metaTop - 14 - i * metaRowH;
    // Alternating row bg
    if (i % 2 === 1) {
      drawRect(ctx, metaBoxX + 1, rowY - 3, metaBoxW - 2, metaRowH, WHITE);
    }
    text(ctx, k, metaBoxX + 8, rowY, { size: 9, bold: true, color: MED_TEXT });
    text(ctx, v, metaBoxX + 90, rowY, { size: 9 });
  });

  ctx.y -= Math.max(fromLines.length * 12 + 14, metaH) + 16;

  // ─── INVOICE CUSTOM FIELDS ───
  const invoiceCustomFields = parseJsonArr(docs.invoice_custom_fields).filter(Boolean);
  if (invoiceCustomFields.length > 0) {
    invoiceCustomFields.forEach((label, i) => {
      text(ctx, `${label}:`, M, ctx.y - i * 14, { size: 9, bold: true, color: MED_TEXT });
      text(ctx, "_______________", M + textWidth(ctx, `${label}: `, 9, true) + 4, ctx.y - i * 14, { size: 9, color: BORDER_COLOR });
    });
    ctx.y -= invoiceCustomFields.length * 14 + 8;
  }

  // ─── BILL TO / SHIP TO ───
  const addrColW = (CW - 20) / 2;
  const billLines = billingAddress
    ? [billingAddress.contact_name, billingAddress.company_name, billingAddress.line1, billingAddress.line2,
       [billingAddress.suburb, billingAddress.city].filter(Boolean).join(", "),
       [billingAddress.postal_code, billingAddress.province].filter(Boolean).join(" "),
       billingAddress.email].filter(Boolean)
    : [order.customer_name, order.customer_email].filter(Boolean);

  const dLines = deliveryAddress
    ? [deliveryAddress.contact_name, deliveryAddress.company_name, deliveryAddress.line1, deliveryAddress.line2,
       [deliveryAddress.suburb, deliveryAddress.city].filter(Boolean).join(", "),
       [deliveryAddress.postal_code, deliveryAddress.province].filter(Boolean).join(" ")].filter(Boolean)
    : [];

  const maxAddrLines = Math.max(billLines.length, dLines.length);
  const addrBlockH = maxAddrLines * 13 + 28;

  // Bill To card
  drawRect(ctx, M, ctx.y - addrBlockH, addrColW, addrBlockH, CARD_BG);
  // Accent bar
  drawRect(ctx, M, ctx.y - addrBlockH, 4, addrBlockH, rgb(pc.r, pc.g, pc.b));
  text(ctx, "Bill To", M + 14, ctx.y - 14, { bold: true, size: 10 });
  billLines.forEach((l: string, i: number) => text(ctx, l, M + 14, ctx.y - 30 - i * 13, { size: 9, color: MED_TEXT }));

  // Ship To card
  if (dLines.length > 0) {
    const shipX = M + addrColW + 20;
    drawRect(ctx, shipX, ctx.y - addrBlockH, addrColW, addrBlockH, CARD_BG);
    drawRect(ctx, shipX, ctx.y - addrBlockH, 4, addrBlockH, rgb(pc.r, pc.g, pc.b));
    text(ctx, "Ship To", shipX + 14, ctx.y - 14, { bold: true, size: 10 });
    dLines.forEach((l: string, i: number) => text(ctx, l, shipX + 14, ctx.y - 30 - i * 13, { size: 9, color: MED_TEXT }));
  }

  ctx.y -= addrBlockH + 18;

  // ─── ITEMS TABLE ───
  const colDesc = M;
  const colQty = W - M - 180;
  const colUnit = W - M - 115;
  const colTotal = W - M - 50;
  const tableHeaderH = 22;

  function drawTableHeader() {
    drawRect(ctx, M, ctx.y - tableHeaderH + 4, CW, tableHeaderH, rgb(pc.r, pc.g, pc.b));
    const hy = ctx.y - 10;
    text(ctx, "Description", colDesc + 8, hy, { bold: true, size: 9, color: WHITE });
    text(ctx, "Qty", colQty, hy, { bold: true, size: 9, color: WHITE });
    const unitW = textWidth(ctx, "Unit Price", 9, true);
    text(ctx, "Unit Price", colUnit - unitW / 2 + 15, hy, { bold: true, size: 9, color: WHITE });
    const totW = textWidth(ctx, "Total", 9, true);
    text(ctx, "Total", colTotal - totW / 2 + 15, hy, { bold: true, size: 9, color: WHITE });
    ctx.y -= tableHeaderH;
  }

  drawTableHeader();

  for (let ji = 0; ji < jobs.length; ji++) {
    const job = jobs[ji];
    const qty = Number(job.quantity || 0);
    const unit = qty > 0 ? Number(job.net_price || 0) / qty : Number(job.net_price || 0);
    const descText = job.product_name + (job.job_name ? ` — ${job.job_name}` : "");
    const descMaxW = colQty - colDesc - 16;

    // Check for spec chips
    const summary = (job.configuration as any)?.summary;
    const chips: string[] = [];
    if (summary) {
      for (let i = 1; i <= 6; i++) {
        const lbl = summary[`primary_spec_${i}_label`];
        const val = summary[`primary_spec_${i}_value`];
        if (lbl && val) chips.push(`${lbl}: ${val}`);
      }
    }

    const descLines = wrapText(ctx, descText, descMaxW, 9);
    const rowH = descLines.length * 12 + (chips.length ? 14 : 0) + 8;

    ensureSpace(ctx, rowH + 4);
    // Check if we're on a new page and need the header
    if (ctx.y > H - 60) {
      drawTableHeader();
    }

    // Alternating background
    if (ji % 2 === 1) {
      drawRect(ctx, M, ctx.y - rowH, CW, rowH, ROW_ALT);
    }

    const rowTop = ctx.y - 12;
    descLines.forEach((line, li) => {
      text(ctx, line, colDesc + 8, rowTop - li * 12, { size: 9 });
    });
    text(ctx, String(qty), colQty + 8, rowTop, { size: 9 });
    const unitPriceStr = fmtMoney(unit, order.currency);
    const upW = textWidth(ctx, unitPriceStr, 9);
    text(ctx, unitPriceStr, colUnit + 30 - upW, rowTop, { size: 9 });
    const totalStr = fmtMoney(Number(job.net_price), order.currency);
    const totW2 = textWidth(ctx, totalStr, 9);
    text(ctx, totalStr, colTotal + 30 - totW2, rowTop, { size: 9 });

    // Spec chips
    if (chips.length) {
      const chipY = rowTop - descLines.length * 12;
      text(ctx, chips.join("  •  "), colDesc + 14, chipY, { size: 8, color: LIGHT_TEXT, maxWidth: descMaxW - 6 });
    }

    // Separator line
    drawLine(ctx, M, ctx.y - rowH, M + CW, BORDER_COLOR, 0.3);
    ctx.y -= rowH;
  }

  ctx.y -= 14;

  // ─── TOTALS BOX ───
  const totalsData: [string, number, boolean][] = [
    ["Subtotal", Number(order.subtotal), false],
  ];
  if (Number(order.discount_amount || 0) > 0) {
    totalsData.push(["Discount", -Number(order.discount_amount), false]);
  }
  if (Number(order.delivery_amount || 0) > 0) {
    totalsData.push(["Delivery", Number(order.delivery_amount), false]);
  }
  const taxLabel = (financial.tax_label as string) || "VAT";
  const taxRate = financial.tax_rate ?? 15;
  totalsData.push([`${taxLabel} (${taxRate}%)`, Number(order.vat_amount), false]);
  totalsData.push(["Total", Number(order.total_amount), true]);
  if (Number(order.amount_paid || 0) > 0) {
    totalsData.push(["Paid", Number(order.amount_paid), false]);
  }
  totalsData.push(["Amount Due", Number(order.amount_due || 0), true]);

  const totBoxW = 220;
  const totBoxX = W - M - totBoxW;
  const totRowH = 18;
  const totBoxH = totalsData.length * totRowH + 8;

  ensureSpace(ctx, totBoxH + 20);
  drawBorderedRect(ctx, totBoxX, ctx.y - totBoxH, totBoxW, totBoxH, { fill: CARD_BG });

  totalsData.forEach(([label, val, isBold], i) => {
    const rowY = ctx.y - 14 - i * totRowH;
    if (isBold) {
      // Draw a top rule for Total / Amount Due
      drawLine(ctx, totBoxX + 8, rowY + 10, totBoxX + totBoxW - 8, rgb(pc.r, pc.g, pc.b), 0.8);
    }
    text(ctx, label, totBoxX + 12, rowY, { size: isBold ? 11 : 9, bold: isBold, color: isBold ? DARK_TEXT : MED_TEXT });
    const valStr = fmtMoney(val, order.currency);
    const vw = textWidth(ctx, valStr, isBold ? 11 : 9, isBold);
    text(ctx, valStr, totBoxX + totBoxW - 12 - vw, rowY, { size: isBold ? 11 : 9, bold: isBold });
  });

  ctx.y -= totBoxH + 18;

  // ─── BANKING DETAILS ───
  if (kind !== "receipt" && (bank.bank_name || bank.account_number)) {
    const bankLines = [
      bank.bank_name && `Bank: ${bank.bank_name}`,
      bank.account_name && `Account Name: ${bank.account_name}`,
      bank.account_number && `Account No: ${bank.account_number}`,
      bank.branch_code && `Branch Code: ${bank.branch_code}`,
      `Reference: ${order.order_number || order.id.slice(0, 8)}`,
    ].filter(Boolean) as string[];

    const bankH = bankLines.length * 13 + 34;
    ensureSpace(ctx, bankH + 10);

    const bankBoxW = 300;
    const bankBoxX = M + (CW - bankBoxW) / 2;
    drawRect(ctx, bankBoxX, ctx.y - bankH, bankBoxW, bankH, CARD_BG);
    drawBorderedRect(ctx, bankBoxX, ctx.y - bankH, bankBoxW, bankH, { borderColor: BORDER_COLOR });

    // Centered header
    const bankTitle = "BANKING DETAILS";
    const btW = textWidth(ctx, bankTitle, 10, true);
    text(ctx, bankTitle, bankBoxX + (bankBoxW - btW) / 2, ctx.y - 16, { size: 10, bold: true, color: MED_TEXT });

    bankLines.forEach((l, i) => {
      const lw = textWidth(ctx, l, 9);
      text(ctx, l, bankBoxX + (bankBoxW - lw) / 2, ctx.y - 32 - i * 13, { size: 9, color: MED_TEXT });
    });

    ctx.y -= bankH + 10;
  }

  // ─── FOOTER on every page ───
  const footerText = (docs.legal_footer_text as string) || `${tenant.legal_name || tenant.name} • Generated ${new Date().toLocaleString("en-ZA")}`;
  const footerLines = footerText.split("\n").map((l: string) => l.trim()).filter(Boolean);
  const totalPages = ctx.pages.length;

  for (let pi = 0; pi < ctx.pages.length; pi++) {
    const page = ctx.pages[pi];
    // Thin rule
    page.drawLine({ start: { x: M, y: 38 }, end: { x: W - M, y: 38 }, thickness: 0.5, color: BORDER_COLOR });
    // Footer text centered
    footerLines.forEach((line: string, i: number) => {
      const fw = font.widthOfTextAtSize(line, 8);
      page.drawText(line, { x: (W - fw) / 2, y: 26 - i * 10, size: 8, font, color: rgb(0.5, 0.52, 0.56) });
    });
    // Page number (right) if multi-page
    if (totalPages > 1) {
      const pn = `Page ${pi + 1} of ${totalPages}`;
      const pw = font.widthOfTextAtSize(pn, 8);
      page.drawText(pn, { x: W - M - pw, y: 26, size: 8, font, color: rgb(0.5, 0.52, 0.56) });
    }
  }

  return pdf.save();
}

// ─── REQUEST HANDLER ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json();
    const { order_id, kind = "invoice" } = body || {};
    if (!order_id) return json({ error: "order_id required" }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const { data: order, error: oErr } = await admin
      .from("orders").select("*").eq("id", order_id).single();
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
    const docs: Record<string, any> = {};
    settingsArr.forEach((s) => {
      if (s.category === "branding") branding[s.setting_key] = s.setting_value;
      if (s.category === "financial") financial[s.setting_key] = s.setting_value;
      if (s.category === "payments") bank[s.setting_key] = s.setting_value;
      if (s.category === "documents") docs[s.setting_key] = s.setting_value;
    });

    const { data: invNum, error: inErr } = await admin.rpc("issue_invoice_number", {
      p_tenant_id: order.tenant_id,
      p_app_id: order.app_id,
    });
    if (inErr || !invNum) return json({ error: `invoice number: ${inErr?.message}` }, 500);

    const billing = (addresses || []).find((a: any) => a.address_type === "billing") || null;
    const delivery = (addresses || []).find((a: any) => a.address_type === "delivery") || null;

    const pdfBytes = await buildPdf({
      invoiceNumber: invNum as string, kind, order, jobs: jobs || [], tenant,
      branding, financial, bank, docs, billingAddress: billing, deliveryAddress: delivery,
    });

    const path = `invoices/${order.tenant_id}/${order.order_number || order.id}/${invNum}.pdf`;
    const upload = await admin.storage
      .from("documents")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upload.error) return json({ error: `upload: ${upload.error.message}` }, 500);

    const { data: inv, error: iErr } = await admin
      .from("order_invoices")
      .insert({
        app_id: order.app_id, tenant_id: order.tenant_id, order_id,
        invoice_number: invNum, kind, storage_bucket: "documents", storage_path: path,
        total_amount: order.total_amount, amount_paid: order.amount_paid, currency: order.currency,
      })
      .select("id").single();
    if (iErr) return json({ error: `insert: ${iErr.message}` }, 500);

    await admin.from("order_documents").insert({
      app_id: order.app_id, tenant_id: order.tenant_id, order_id,
      document_type: kind === "credit_note" ? "credit_note" : kind === "receipt" ? "receipt" : "invoice",
      title: `${kind === "credit_note" ? "Credit Note" : kind === "proforma" ? "Proforma Invoice" : kind === "receipt" ? "Receipt" : "Tax Invoice"} ${invNum}`,
      file_name: `${invNum}.pdf`, storage_bucket: "documents", storage_path: path,
      mime_type: "application/pdf", file_size_bytes: pdfBytes.byteLength,
      is_customer_visible: true, source_app_managed: true, created_by: u.user.id,
      metadata: { invoice_id: inv?.id, kind },
    });

    return json({ success: true, invoice_id: inv?.id, invoice_number: invNum, storage_path: path });
  } catch (e) {
    console.error("generate-invoice-pdf error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
