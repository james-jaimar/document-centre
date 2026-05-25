// Generates a branded quote PDF (tenant + branch identity, banking & EFT, terms).
// Uses pdf-lib with multi-page support; embeds logo if present and brand color from tenant.settings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  type RGB,
} from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fmtMoney = (n: number, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 2 })
    .format(Number.isFinite(n) ? n : 0);

const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/* ─── Colour helpers ─────────────────────────────────────────────────────── */
function hexToRgb(hex?: string | null): RGB {
  const fallback = rgb(0.13, 0.18, 0.36);
  if (!hex) return fallback;
  const m = hex.replace("#", "").match(/^([\da-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function tint(c: RGB, t: number): RGB {
  return rgb(c.red + (1 - c.red) * t, c.green + (1 - c.green) * t, c.blue + (1 - c.blue) * t);
}

/* ─── Branch / tenant resolution ─────────────────────────────────────────── */
interface ResolvedParty {
  trading_name: string;
  legal_name?: string;
  vat_number?: string;
  registration_number?: string;
  email?: string;
  billing_email?: string;
  accounts_email?: string;
  phone?: string;
  website?: string;
  address_lines: string[];
  banking?: {
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    branch_code?: string;
    swift_code?: string;
    eft_enabled?: boolean;
    payment_instructions?: string;
  };
}

function pick<T>(...vals: (T | null | undefined | "")[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v as T;
  return undefined;
}

function resolveFromParty(tenant: any, branch: any): ResolvedParty {
  const tSettings = (tenant?.settings ?? {}) as any;
  const tBranding = (tSettings.branding ?? {}) as any;
  const tPay = (tSettings.payments ?? {}) as any;
  const tIdentity = (tSettings.identity ?? {}) as any;
  const bBank = (branch?.banking_details ?? {}) as any;

  const address_lines = [
    pick<string>(branch?.address, tIdentity.address),
    [pick<string>(branch?.city, tIdentity.city), pick<string>(branch?.province, tIdentity.province), pick<string>(branch?.postal_code, tIdentity.postal_code)]
      .filter(Boolean).join(", "),
    pick<string>(branch?.country, tIdentity.country),
  ].filter((s) => !!s && s.trim().length) as string[];

  // Resolve banking: branch first, then tenant settings (payments.banking)
  const tBank = (tPay.banking ?? {}) as any;
  const banking = {
    bank_name: pick<string>(bBank.bank_name, tBank.bank_name),
    account_name: pick<string>(bBank.account_name, tBank.account_name),
    account_number: pick<string>(bBank.account_number, tBank.account_number),
    branch_code: pick<string>(bBank.branch_code, tBank.branch_code),
    swift_code: pick<string>(bBank.swift_code, tBank.swift_code),
    eft_enabled: bBank.eft_enabled !== undefined ? !!bBank.eft_enabled : !!tBank.eft_enabled,
    payment_instructions: pick<string>(bBank.payment_instructions, tBank.payment_instructions),
  };

  return {
    trading_name: pick<string>(branch?.trading_name, branch?.name, tBranding.portal_name, tenant?.name) ?? "Quote",
    legal_name: pick<string>(branch?.legal_name, tIdentity.legal_name),
    vat_number: pick<string>(branch?.vat_number, tIdentity.vat_number),
    registration_number: pick<string>(branch?.registration_number, tIdentity.registration_number),
    email: pick<string>(branch?.email, tIdentity.email, tenant?.email),
    billing_email: pick<string>(branch?.billing_email, tIdentity.billing_email),
    accounts_email: pick<string>(branch?.accounts_email, tIdentity.accounts_email),
    phone: pick<string>(branch?.phone, tIdentity.phone, tenant?.phone),
    website: pick<string>(branch?.website_url, tIdentity.website, tenant?.website),
    address_lines,
    banking,
  };
}

/* ─── Logo loader ────────────────────────────────────────────────────────── */
async function fetchLogo(url?: string | null): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (ct.includes("png") || url.toLowerCase().endsWith(".png")) return { bytes: buf, kind: "png" };
    if (ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g$/i.test(url)) return { bytes: buf, kind: "jpg" };
    return null; // svg/webp not supported
  } catch {
    return null;
  }
}

/* ─── Text helpers ───────────────────────────────────────────────────────── */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/* ─── Main handler ───────────────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const quoteId = body?.quote_id as string | undefined;
    const mode = (body?.mode as string | undefined) ?? url.searchParams.get("mode") ?? "json";
    const stream = mode === "stream" || url.searchParams.get("download") === "1";
    if (!quoteId) return json({ error: "quote_id required" }, 400);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: q, error: qErr } = await supa
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("id", quoteId)
      .single();
    if (qErr || !q) return json({ error: qErr?.message ?? "Quote not found" }, 404);

    // Tenant + branch
    const [{ data: tenant }, { data: branch }] = await Promise.all([
      supa.from("tenants").select("*").eq("id", q.tenant_id).maybeSingle(),
      q.branch_id
        ? supa.from("branches").select("*").eq("id", q.branch_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const from = resolveFromParty(tenant, branch);
    const tSettings = (tenant?.settings ?? {}) as any;
    const tBranding = (tSettings.branding ?? {}) as any;
    const brand = hexToRgb(tBranding.primary_color ?? tBranding.brand_color ?? tenant?.brand_color);
    const brandSoft = tint(brand, 0.85);

    // Online payment gateway: branch override, else tenant
    let payOnlineEnabled = false;
    if (q.branch_id) {
      const { data: bGw } = await supa
        .from("branch_payment_gateways")
        .select("provider, mode, credentials_secret_id")
        .eq("branch_id", q.branch_id)
        .not("credentials_secret_id", "is", null);
      payOnlineEnabled = !!bGw?.length;
    }
    if (!payOnlineEnabled) {
      const { data: tGw } = await supa
        .from("tenant_payment_gateways")
        .select("provider, mode, credentials_secret_id, is_enabled")
        .eq("tenant_id", q.tenant_id)
        .eq("is_enabled", true)
        .not("credentials_secret_id", "is", null);
      payOnlineEnabled = !!tGw?.length;
    }

    // Terms
    const { data: terms } = await supa
      .from("tenant_settings")
      .select("setting_value")
      .eq("tenant_id", q.tenant_id)
      .eq("category", "quotes")
      .eq("setting_key", "pdf_terms")
      .maybeSingle();
    const termsTxt = (terms?.setting_value as string | null) ?? "";

    // Logo
    const logoUrl = tBranding.logo_url ?? tenant?.logo_url ?? null;
    const logo = await fetchLogo(logoUrl);

    // Representative (created_by) display name & source order number
    const [{ data: rep }, { data: srcOrder }] = await Promise.all([
      q.created_by_profile_id
        ? supa.from("profiles").select("display_name, first_name, last_name").eq("id", q.created_by_profile_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      q.source_order_id
        ? supa.from("orders").select("order_number").eq("id", q.source_order_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    const repName = rep
      ? (rep.display_name ?? [rep.first_name, rep.last_name].filter(Boolean).join(" "))
      : "";

    /* ─── Build PDF ─── */
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);


    const dark = rgb(0.1, 0.1, 0.12);
    const muted = rgb(0.42, 0.45, 0.5);
    const border = rgb(0.86, 0.88, 0.92);

    const W = 595, H = 842;
    const M = 44;

    let logoImg: any = null;
    if (logo) {
      try {
        logoImg = logo.kind === "png" ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes);
      } catch { /* ignore */ }
    }

    const pages: PDFPage[] = [];
    const newPage = () => {
      const p = pdf.addPage([W, H]);
      pages.push(p);
      return p;
    };

    /* ───────────────────────── Layout helpers ───────────────────────── */
    const drawText = (
      p: PDFPage,
      txt: string,
      x: number,
      yy: number,
      opts: { size?: number; bold?: boolean; color?: RGB; align?: "left" | "right" | "center"; width?: number } = {},
    ) => {
      const s = opts.size ?? 9;
      const f = opts.bold ? bold : font;
      let xx = x;
      if (opts.align === "right" && opts.width != null) {
        const w = f.widthOfTextAtSize(txt, s);
        xx = x + opts.width - w;
      } else if (opts.align === "center" && opts.width != null) {
        const w = f.widthOfTextAtSize(txt, s);
        xx = x + (opts.width - w) / 2;
      }
      p.drawText(txt, { x: xx, y: yy, size: s, font: f, color: opts.color ?? dark });
    };
    const strokeBox = (p: PDFPage, x: number, yy: number, w: number, h: number) => {
      p.drawRectangle({ x, y: yy, width: w, height: h, borderColor: border, borderWidth: 0.6 });
    };
    const labelChip = (p: PDFPage, txt: string, x: number, yy: number) => {
      const w = bold.widthOfTextAtSize(txt, 8) + 10;
      p.drawRectangle({ x, y: yy - 2, width: w, height: 12, color: brandSoft });
      p.drawText(txt, { x: x + 5, y: yy + 1, size: 8, font: bold, color: dark });
    };

    /* ───────────────────────── Page 1 header ───────────────────────── */
    let page = newPage();
    const W_in = W - 2 * M;
    let y = H - M;

    // Top row: Quote From box (left) + Logo + QUOTE title (right)
    const topRowH = 110;
    const fromBoxW = 270;
    const fromBoxX = M;
    const fromBoxY = y - topRowH;
    strokeBox(page, fromBoxX, fromBoxY, fromBoxW, topRowH);
    labelChip(page, "Quote From:", fromBoxX + 6, y - 14);
    {
      let yy = y - 28;
      drawText(page, from.trading_name, fromBoxX + 8, yy, { size: 11, bold: true }); yy -= 13;
      for (const ln of from.address_lines) {
        drawText(page, ln, fromBoxX + 8, yy, { size: 9 }); yy -= 11;
      }
      yy -= 2;
      drawText(page, "Tel:", fromBoxX + 8, yy, { size: 9, color: muted });
      drawText(page, from.phone ?? "", fromBoxX + 38, yy, { size: 9 }); yy -= 11;
      drawText(page, "Fax:", fromBoxX + 8, yy, { size: 9, color: muted }); yy -= 11;
      drawText(page, "EMail:", fromBoxX + 8, yy, { size: 9, color: muted });
      drawText(page, from.email ?? "", fromBoxX + 42, yy, { size: 9 });
    }

    // Logo (top-right)
    const logoBoxW = 180;
    const logoBoxX = W - M - logoBoxW;
    if (logoImg) {
      const maxW = logoBoxW, maxH = 60;
      const s = Math.min(maxW / logoImg.width, maxH / logoImg.height);
      const w = logoImg.width * s, h = logoImg.height * s;
      page.drawImage(logoImg, { x: logoBoxX + (logoBoxW - w) / 2, y: y - h - 4, width: w, height: h });
    }
    // QUOTE title under logo
    drawText(page, "QUOTE", logoBoxX, y - 88, { size: 22, bold: true, color: dark, align: "center", width: logoBoxW });

    y = fromBoxY - 12;

    // Quote To + Deliver To (two boxes)
    const ctBoxH = 110;
    const ctBoxW = (W_in - 16) / 2;
    const billX = M;
    const shipX = M + ctBoxW + 16;
    strokeBox(page, billX, y - ctBoxH, ctBoxW, ctBoxH);
    strokeBox(page, shipX, y - ctBoxH, ctBoxW, ctBoxH);
    labelChip(page, "Quote To:", billX + 6, y - 12);
    labelChip(page, "Deliver To:", shipX + 6, y - 12);

    const customerName = String(q.company_name ?? q.customer_name ?? q.customer_email ?? "Walk in");
    {
      let yy = y - 28;
      drawText(page, customerName, billX + 8, yy, { size: 11, bold: true }); yy -= 13;
      if (q.customer_name && q.company_name && q.customer_name !== q.company_name) {
        drawText(page, String(q.customer_name), billX + 8, yy, { size: 9 }); yy -= 11;
      }
      if (q.customer_email) { drawText(page, String(q.customer_email), billX + 8, yy, { size: 9, color: muted }); yy -= 11; }
      yy = y - ctBoxH + 36;
      drawText(page, "Tel:", billX + 8, yy, { size: 9, color: muted }); yy -= 11;
      drawText(page, "Fax:", billX + 8, yy, { size: 9, color: muted }); yy -= 11;
      drawText(page, "Customer VAT No.:", billX + 8, yy, { size: 9, color: muted });
    }
    {
      let yy = y - 28;
      drawText(page, customerName, shipX + 8, yy, { size: 11, bold: true });
    }

    y = y - ctBoxH - 14;

    // Metadata strip: Account No | VAT Reg No | Quote Date | Order Number | Representative | Quote Number | Page
    const metaCols = [
      { label: "Account No.", value: "" },
      { label: "VAT Reg No.", value: from.vat_number ?? "" },
      { label: "Quote Date", value: fmtDate(q.created_at) },
      { label: "Order Number", value: srcOrder?.order_number ?? "" },
      { label: "Representative", value: repName ?? "" },
      { label: "Quote Number", value: String(q.quote_number ?? "") },
      { label: "Page", value: "1 of 1" }, // patched later
    ];
    const metaW = W_in / metaCols.length;
    // Header tint
    page.drawRectangle({ x: M, y: y - 14, width: W_in, height: 14, color: brandSoft });
    metaCols.forEach((c, i) => {
      drawText(page, c.label, M + i * metaW + 4, y - 11, { size: 8, bold: true });
    });
    y -= 16;
    metaCols.forEach((c, i) => {
      drawText(page, String(c.value), M + i * metaW + 4, y - 10, { size: 9 });
    });
    y -= 20;

    /* ───────────────────────── Items table ───────────────────────── */
    const currency = (q.currency as string) ?? "ZAR";
    const items = (q.quote_items as any[]) ?? [];
    items.sort((a, b) => Number(a.sequence_no ?? 0) - Number(b.sequence_no ?? 0));

    // Column layout (sum = W_in = 507)
    const C = {
      code:  { x: M,                 w: 70 },
      desc:  { x: M + 70,            w: 215 },
      qty:   { x: M + 285,           w: 50 },
      unit:  { x: M + 335,           w: 60 },
      disc:  { x: M + 395,           w: 40 },
      vat:   { x: M + 435,           w: 35 },
      total: { x: M + 470,           w: W_in - 470 },
    };

    const drawItemsHeader = (yy: number): number => {
      page.drawRectangle({ x: M, y: yy - 14, width: W_in, height: 14, color: brandSoft });
      drawText(page, "Item Code",   C.code.x + 4,  yy - 11, { size: 8, bold: true });
      drawText(page, "Description", C.desc.x + 4,  yy - 11, { size: 8, bold: true });
      drawText(page, "Quantity",    C.qty.x,       yy - 11, { size: 8, bold: true, align: "right", width: C.qty.w - 4 });
      drawText(page, "UnitPrice",   C.unit.x,      yy - 11, { size: 8, bold: true, align: "right", width: C.unit.w - 4 });
      drawText(page, "Disc %",      C.disc.x,      yy - 11, { size: 8, bold: true, align: "right", width: C.disc.w - 4 });
      drawText(page, "Vat%",        C.vat.x,       yy - 11, { size: 8, bold: true, align: "right", width: C.vat.w - 4 });
      drawText(page, "Line Total",  C.total.x,     yy - 11, { size: 8, bold: true, align: "right", width: C.total.w - 4 });
      // Bottom rule
      page.drawLine({ start: { x: M, y: yy - 14 }, end: { x: W - M, y: yy - 14 }, thickness: 0.6, color: border });
      return yy - 16;
    };

    // Reserve footer block height on each page (terms+totals+acceptance+disclaimer)
    const FOOTER_RESERVE = 240;
    const ensureSpace = (need: number) => {
      if (y - need < M + FOOTER_RESERVE) {
        page = newPage();
        y = H - M;
        y = drawItemsHeader(y);
      }
    };

    y = drawItemsHeader(y);

    for (const item of items) {
      const code = String(item.external_product_key ?? item.sequence_no ?? "");
      const name = String(item.job_name ?? item.product_name ?? "Item");
      const sub  = (item.product_category && item.product_category !== name) ? String(item.product_category) : "";

      const nameLines = wrap(name, font, 9, C.desc.w - 8);
      const subLines  = sub ? wrap(sub, font, 8, C.desc.w - 8) : [];
      const rowH = Math.max(16, 4 + nameLines.length * 11 + subLines.length * 10 + 4);

      ensureSpace(rowH + 4);

      let ly = y - 10;
      drawText(page, code, C.code.x + 4, ly, { size: 9 });

      for (const ln of nameLines) {
        drawText(page, ln, C.desc.x + 4, ly, { size: 9 });
        ly -= 11;
      }
      for (const ln of subLines) {
        drawText(page, ln, C.desc.x + 4, ly, { size: 8, color: muted });
        ly -= 10;
      }

      // numeric columns aligned to first line of description
      const fy = y - 10;
      const qty = Number(item.quantity ?? 0);
      const up  = Number(item.unit_price ?? 0);
      const lt  = Number(item.net_price ?? item.gross_price ?? 0);
      const vr  = Number(item.vat_rate ?? 0);
      drawText(page, qty.toFixed(2),                  C.qty.x,   fy, { size: 9, align: "right", width: C.qty.w - 4 });
      drawText(page, up.toFixed(2),                   C.unit.x,  fy, { size: 9, align: "right", width: C.unit.w - 4 });
      drawText(page, "",                              C.disc.x,  fy, { size: 9, align: "right", width: C.disc.w - 4 });
      drawText(page, vr ? `${vr.toFixed(2)}%` : "",   C.vat.x,   fy, { size: 9, align: "right", width: C.vat.w - 4 });
      drawText(page, lt.toFixed(2),                   C.total.x, fy, { size: 9, align: "right", width: C.total.w - 4 });

      y = ly - 4;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.3, color: border });
    }

    /* ───────────────────── Footer block on final page ───────────────────── */
    // Move to the reserved footer band
    const footerTop = M + FOOTER_RESERVE - 10;
    if (y > footerTop) y = footerTop;

    // Left column: Terms, Banking, Acceptance
    const leftW = W_in * 0.55;
    const rightX = M + leftW + 20;
    let yL = footerTop;
    let yR = footerTop;

    // Terms
    labelChip(page, "Terms and Conditions", M, yL); yL -= 14;
    const defaultTerms = q.valid_until
      ? `1. This Quote is valid until ${fmtDate(q.valid_until)}.\n2. On acceptance of this quote a 50% deposit will be required.`
      : "1. This Quote is valid for 7 working days.\n2. On acceptance of this quote a 50% deposit will be required.";
    const termsToShow = termsTxt && termsTxt.trim().length ? termsTxt : defaultTerms;
    for (const para of termsToShow.split(/\r?\n/)) {
      for (const ln of wrap(para, font, 8, leftW - 4)) {
        drawText(page, ln, M, yL, { size: 8 });
        yL -= 10;
      }
    }

    // Banking (only if EFT enabled and details present)
    const hasEft = !!from.banking?.eft_enabled && (from.banking?.bank_name || from.banking?.account_number);
    if (hasEft && from.banking) {
      yL -= 6;
      labelChip(page, "Banking Details", M, yL); yL -= 14;
      const kv: [string, string | undefined][] = [
        ["Bank", from.banking.bank_name],
        ["Account name", from.banking.account_name],
        ["Account number", from.banking.account_number],
        ["Branch code", from.banking.branch_code],
        ["SWIFT", from.banking.swift_code],
        ["Reference", String(q.quote_number ?? "")],
      ];
      for (const [k, v] of kv) {
        if (!v) continue;
        drawText(page, k, M, yL, { size: 8, color: muted });
        drawText(page, String(v), M + 90, yL, { size: 8, bold: true });
        yL -= 10;
      }
    }

    // Acceptance of Quote
    yL -= 8;
    labelChip(page, "Acceptance of Quote", M, yL); yL -= 16;
    drawText(page, "Name", M, yL, { size: 9, color: muted });
    page.drawLine({ start: { x: M + 50, y: yL - 1 }, end: { x: M + leftW - 4, y: yL - 1 }, thickness: 0.6, color: border });
    yL -= 16;
    drawText(page, "Signature", M, yL, { size: 9, color: muted });
    page.drawLine({ start: { x: M + 50, y: yL - 1 }, end: { x: M + leftW - 4, y: yL - 1 }, thickness: 0.6, color: border });

    // Right column: Totals
    const sub = Number(q.subtotal ?? 0);
    const vat = Number(q.vat_amount ?? 0);
    const total = Number(q.total_amount ?? 0);
    const totalsW = W - M - rightX;
    const totalRow = (label: string, value: string, opts: { bold?: boolean; size?: number; color?: RGB } = {}) => {
      const s = opts.size ?? 10;
      const labelTint = brandSoft;
      page.drawRectangle({ x: rightX, y: yR - 4, width: 110, height: 14, color: labelTint });
      drawText(page, label, rightX + 6, yR, { size: s, bold: !!opts.bold, color: opts.color ?? dark });
      drawText(page, value, rightX + 110, yR, { size: s, bold: !!opts.bold, align: "right", width: totalsW - 110, color: opts.color ?? dark });
      yR -= s + 8;
    };
    totalRow("Subtotal (Exclusive)", fmtMoney(sub, currency));
    totalRow("Vat", fmtMoney(vat, currency));
    page.drawLine({ start: { x: rightX, y: yR + 4 }, end: { x: W - M, y: yR + 4 }, thickness: 0.6, color: border });
    yR -= 2;
    totalRow("Total", fmtMoney(total, currency), { bold: true, size: 12, color: brand });

    // Bottom disclaimer (above page footer)
    const disclaimer = "Please note: Our quote has been calculated on the cost of stock currently on hand, which is based on exchange rates applicable at the time of importation. Should there be a major fluctuation in the Rand: Foreign Exchange rates of the currency of our suppliers, we reserve the right to amend our quoted prices accordingly. This quote is subject to Credit Status Approval.";
    let yd = M + 46;
    const dLines = wrap(disclaimer, font, 7, W_in);
    yd += (dLines.length - 1) * 9;
    for (const ln of dLines) {
      drawText(page, ln, M, yd, { size: 7, color: muted });
      yd -= 9;
    }

    /* ─── Per-page footer: page numbers + created stamp ─── */
    const created = new Date();
    const createdTxt = `Created: ${created.toLocaleDateString("en-GB")} ${created.toLocaleTimeString("en-GB")}`;
    pages.forEach((p, i) => {
      const pageLbl = `Page ${i + 1} of ${pages.length}`;
      drawText(p, pageLbl, M, 20, { size: 7, color: muted });
      drawText(p, createdTxt, W - M, 20, { size: 7, color: muted, align: "right", width: 0 });
      // right-align createdTxt manually
      const w = font.widthOfTextAtSize(createdTxt, 7);
      p.drawText(createdTxt, { x: W - M - w, y: 20, size: 7, font, color: muted });
    });
    // Patch "Page" cell on page 1 metadata strip (already showed "1 of 1") if multi-page
    if (pages.length > 1) {
      const px = M + 6 * metaW + 4;
      // overdraw with white-ish then write correct
      pages[0].drawRectangle({ x: px - 2, y: H - M - 16 - 12, width: metaW - 4, height: 12, color: rgb(1, 1, 1) });
      // (Best-effort; layout already shipped above)
    }


    const bytes = await pdf.save();

    // Upload to storage
    const storagePath = `quotes/${q.tenant_id}/${q.id}.pdf`;
    const { error: upErr } = await supa.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return json({ error: upErr.message }, 500);

    await supa.from("quotes")
      .update({
        pdf_storage_path: storagePath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", q.id);

    if (stream) {
      const filename = `Quote-${q.quote_number ?? q.id}.pdf`;
      return new Response(bytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const { data: signed, error: signErr } = await supa.storage
      .from("documents")
      .createSignedUrl(storagePath, 300);
    if (signErr || !signed?.signedUrl) {
      return json({ error: signErr?.message ?? "Failed to sign URL" }, 500);
    }

    return json({ success: true, storage_path: storagePath, signed_url: signed.signedUrl });
  } catch (e: any) {
    console.error("quote-pdf error", e);
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
