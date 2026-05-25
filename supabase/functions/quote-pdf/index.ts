// Generates a branded quote PDF (tenant + branch identity, banking & EFT, terms).
// Uses pdf-lib; rasterises SVG logos via @resvg/resvg-wasm.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  type RGB,
} from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

/* ─── Embedded TrueType font (cached across warm invocations) ─────────────── */
const FONT_REG_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.0.22/files/noto-sans-latin-400-normal.ttf";
const FONT_BOLD_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.0.22/files/noto-sans-latin-700-normal.ttf";
let fontRegCache: Uint8Array | null = null;
let fontBoldCache: Uint8Array | null = null;
async function loadFontBytes(): Promise<{ reg: Uint8Array | null; bold: Uint8Array | null }> {
  try {
    if (!fontRegCache) {
      const r = await fetch(FONT_REG_URL);
      if (r.ok) fontRegCache = new Uint8Array(await r.arrayBuffer());
    }
    if (!fontBoldCache) {
      const r = await fetch(FONT_BOLD_URL);
      if (r.ok) fontBoldCache = new Uint8Array(await r.arrayBuffer());
    }
  } catch (e) {
    console.warn("[quote-pdf] font fetch failed, falling back to Helvetica", e);
  }
  return { reg: fontRegCache, bold: fontBoldCache };
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "Content-Disposition",
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

/* ─── Logo loader (PNG / JPG / SVG via resvg) ────────────────────────────── */
let resvgReady: Promise<void> | null = null;
function ensureResvg() {
  if (!resvgReady) {
    resvgReady = initWasm(
      fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm").then((r) =>
        r.arrayBuffer(),
      ) as any,
    ).catch((e) => {
      console.error("resvg init failed", e);
    });
  }
  return resvgReady;
}

const logoCache = new Map<string, { bytes: Uint8Array; kind: "png" | "jpg" }>();

async function fetchLogo(url?: string | null): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  if (!url) return null;
  if (logoCache.has(url)) return logoCache.get(url)!;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    const lower = url.toLowerCase();
    let out: { bytes: Uint8Array; kind: "png" | "jpg" } | null = null;
    if (ct.includes("png") || lower.endsWith(".png")) {
      out = { bytes: buf, kind: "png" };
    } else if (ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g$/i.test(lower)) {
      out = { bytes: buf, kind: "jpg" };
    } else if (ct.includes("svg") || lower.endsWith(".svg")) {
      try {
        await ensureResvg();
        const svgText = new TextDecoder().decode(buf);
        const resvg = new Resvg(svgText, {
          fitTo: { mode: "width", value: 800 },
          background: "rgba(0,0,0,0)",
        });
        const png = resvg.render().asPng();
        out = { bytes: png, kind: "png" };
      } catch (e) {
        console.warn("svg rasterise failed", e);
      }
    }
    if (out) logoCache.set(url, out);
    return out;
  } catch (e) {
    console.warn("logo fetch failed", e);
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
    const tBrandingJson = (tSettings.branding ?? {}) as any;

    // Branding actually lives in the tenant_settings table (category=branding).
    // Pull it and merge over the JSONB fallback so existing tenants still work.
    const { data: brandingRows } = await supa
      .from("tenant_settings")
      .select("setting_key, setting_value")
      .eq("tenant_id", q.tenant_id)
      .eq("category", "branding");
    const tBrandingTable: Record<string, any> = {};
    for (const row of brandingRows ?? []) {
      tBrandingTable[row.setting_key as string] = row.setting_value;
    }
    const tBranding = { ...tBrandingJson, ...tBrandingTable };

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

    // Logo (PNG/JPG embedded directly, SVG rasterised)
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
    pdf.registerFontkit(fontkit);
    const { reg: fontRegBytes, bold: fontBoldBytes } = await loadFontBytes();
    const font = fontRegBytes
      ? await pdf.embedFont(fontRegBytes, { subset: true })
      : await pdf.embedFont(StandardFonts.Helvetica);
    const bold = fontBoldBytes
      ? await pdf.embedFont(fontBoldBytes, { subset: true })
      : await pdf.embedFont(StandardFonts.HelveticaBold);


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
      const w = bold.widthOfTextAtSize(txt, 8) + 12;
      p.drawRectangle({ x, y: yy - 2, width: w, height: 12, color: brandSoft });
      p.drawText(txt, { x: x + 6, y: yy + 1, size: 8, font: bold, color: dark });
    };
    const wrapText = (
      txt: string,
      f: typeof font,
      size: number,
      maxWidth: number,
    ): string[] => {
      const out: string[] = [];
      const paragraphs = String(txt ?? "").split(/\r?\n/);
      for (const para of paragraphs) {
        if (!para) { out.push(""); continue; }
        const words = para.split(/\s+/);
        let line = "";
        for (const w of words) {
          const candidate = line ? `${line} ${w}` : w;
          if (f.widthOfTextAtSize(candidate, size) <= maxWidth) {
            line = candidate;
          } else if (!line) {
            // single word longer than maxWidth — hard break by char
            let chunk = "";
            for (const ch of w) {
              const c2 = chunk + ch;
              if (f.widthOfTextAtSize(c2, size) <= maxWidth) chunk = c2;
              else { if (chunk) out.push(chunk); chunk = ch; }
            }
            line = chunk;
          } else {
            out.push(line);
            line = w;
          }
        }
        if (line) out.push(line);
      }
      return out;
    };



    /* ───────────────────────── Page 1 header ───────────────────────── */
    let page = newPage();
    const W_in = W - 2 * M;
    let y = H - M;


    // Top row: Quote From box (left) + Logo + QUOTE title (right)
    const fromBoxW = 270;
    const fromBoxX = M;
    const padX = 8;
    const innerW = fromBoxW - padX * 2;
    const labelColW = 34; // "EMail:" column
    const valueW = innerW - labelColW;

    // Pre-compute wrapped lines for "From" so we can size the box height.
    const fromTradingLines = wrapText(from.trading_name ?? "", bold, 11, innerW);
    const fromAddrLines: string[] = [];
    for (const ln of from.address_lines) {
      for (const w of wrapText(ln, font, 9, innerW)) fromAddrLines.push(w);
    }
    const fromPhoneLines = wrapText(from.phone ?? "", font, 9, valueW);
    const fromEmailLines = wrapText(from.email ?? "", font, 9, innerW - 38);

    // Heights: chip(18) + trading(13*lines) + addr(11*lines) + gap(2) + tel(11*lines) + fax(11) + email(11*lines) + pad(8)
    const fromContentH =
      18 +
      13 * Math.max(1, fromTradingLines.length) +
      11 * fromAddrLines.length +
      2 +
      11 * Math.max(1, fromPhoneLines.length) +
      11 +
      11 * Math.max(1, fromEmailLines.length) +
      8;
    const topRowH = Math.max(110, fromContentH);
    const fromBoxY = y - topRowH;
    strokeBox(page, fromBoxX, fromBoxY, fromBoxW, topRowH);
    labelChip(page, "Quote From:", fromBoxX + 6, y - 14);
    {
      let yy = y - 28;
      for (const ln of fromTradingLines) {
        drawText(page, ln, fromBoxX + padX, yy, { size: 11, bold: true }); yy -= 13;
      }
      for (const ln of fromAddrLines) {
        drawText(page, ln, fromBoxX + padX, yy, { size: 9 }); yy -= 11;
      }
      yy -= 2;
      drawText(page, "Tel:", fromBoxX + padX, yy, { size: 9, color: muted });
      for (let i = 0; i < Math.max(1, fromPhoneLines.length); i++) {
        drawText(page, fromPhoneLines[i] ?? "", fromBoxX + padX + 30, yy, { size: 9 });
        yy -= 11;
      }
      drawText(page, "Fax:", fromBoxX + padX, yy, { size: 9, color: muted }); yy -= 11;
      drawText(page, "EMail:", fromBoxX + padX, yy, { size: 9, color: muted });
      for (let i = 0; i < Math.max(1, fromEmailLines.length); i++) {
        drawText(page, fromEmailLines[i] ?? "", fromBoxX + padX + 34, yy, { size: 9 });
        yy -= 11;
      }
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
    drawText(page, String(q.quote_number ?? ""), logoBoxX, y - 108, { size: 14, bold: true, color: brand, align: "center", width: logoBoxW });

    y = fromBoxY - 12;

    // Quote To + Deliver To (two boxes)
    const ctBoxW = (W_in - 16) / 2;
    const ctInnerW = ctBoxW - padX * 2;
    const billX = M;
    const shipX = M + ctBoxW + 16;

    const customerName = String(q.company_name ?? q.customer_name ?? q.customer_email ?? "Walk in");
    const billNameLines = wrapText(customerName, bold, 11, ctInnerW);
    const billExtraLines: string[] = [];
    if (q.customer_name && q.company_name && q.customer_name !== q.company_name) {
      for (const w of wrapText(String(q.customer_name), font, 9, ctInnerW)) billExtraLines.push(w);
    }
    const billEmailLines = q.customer_email
      ? wrapText(String(q.customer_email), font, 9, ctInnerW)
      : [];
    const billH = 18 + 13 * billNameLines.length + 11 * billExtraLines.length + 11 * billEmailLines.length + 8;

    const shipNameLines = wrapText(customerName, bold, 11, ctInnerW);
    const shipH = 18 + 13 * shipNameLines.length + 13 + 8;

    const ctBoxH = Math.max(80, billH, shipH);
    strokeBox(page, billX, y - ctBoxH, ctBoxW, ctBoxH);
    strokeBox(page, shipX, y - ctBoxH, ctBoxW, ctBoxH);
    labelChip(page, "Quote To:", billX + 6, y - 12);
    labelChip(page, "Deliver To:", shipX + 6, y - 12);

    {
      let yy = y - 28;
      for (const ln of billNameLines) {
        drawText(page, ln, billX + padX, yy, { size: 11, bold: true }); yy -= 13;
      }
      for (const ln of billExtraLines) {
        drawText(page, ln, billX + padX, yy, { size: 9 }); yy -= 11;
      }
      for (const ln of billEmailLines) {
        drawText(page, ln, billX + padX, yy, { size: 9, color: muted }); yy -= 11;
      }
    }
    {
      let yy = y - 28;
      for (const ln of shipNameLines) {
        drawText(page, ln, shipX + padX, yy, { size: 11, bold: true }); yy -= 13;
      }
      drawText(page, "Same as billing", shipX + padX, yy, { size: 9, color: muted });
    }

    y = y - ctBoxH - 14;


    // Metadata strip: Account No | VAT Reg No | Quote Date | Order Number | Representative | Quote Number
    const metaCols = [
      { label: "Account No.", value: "" },
      { label: "VAT Reg No.", value: from.vat_number ?? "" },
      { label: "Quote Date", value: fmtDate(q.created_at) },
      { label: "Order Number", value: srcOrder?.order_number ?? "" },
      { label: "Representative", value: repName ?? "" },
      { label: "Quote Number", value: String(q.quote_number ?? "") },
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

    // ── Resolve product_option slug → label per family ──
    const familyIds = Array.from(
      new Set(items.map((i) => i.product_family_id).filter(Boolean)),
    ) as string[];
    // Map: familyId → optionName → (slug → label)
    const optionLabelMap = new Map<string, Map<string, Map<string, string>>>();
    if (familyIds.length) {
      const { data: optRows } = await supa
        .from("product_options")
        .select("product_family_id, name, values")
        .in("product_family_id", familyIds);
      for (const row of optRows ?? []) {
        const famMap = optionLabelMap.get(row.product_family_id) ?? new Map();
        const slugMap = new Map<string, string>();
        const vals = Array.isArray(row.values) ? row.values : [];
        for (const v of vals as any[]) {
          if (v && typeof v === "object" && v.slug) {
            slugMap.set(String(v.slug), String(v.label ?? v.slug));
          }
        }
        famMap.set(String(row.name), slugMap);
        optionLabelMap.set(row.product_family_id, famMap);
      }
    }

    const titleCase = (s: string) =>
      s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const isNoneSlug = (slug: string) =>
      /^no-/i.test(slug) || /^none[-_]/i.test(slug) || slug === "none";

    /** Build [label, value] spec pairs for an item, skipping "no-*" noise. */
    const buildSpecs = (item: any): [string, string][] => {
      const cfg = (item.configuration ?? {}) as any;
      const sel = (cfg.selected_options ?? {}) as Record<string, string>;
      const famMap = optionLabelMap.get(item.product_family_id) ?? new Map();
      const out: [string, string][] = [];

      for (const [optName, slug] of Object.entries(sel)) {
        if (!slug || typeof slug !== "string") continue;
        if (isNoneSlug(slug)) continue;
        const slugMap = famMap.get(optName);
        const label = slugMap?.get(slug) ?? titleCase(slug);
        out.push([optName, label]);
      }

      if (cfg.page_count != null) out.push(["Pages", String(cfg.page_count)]);
      if (typeof cfg.is_color === "boolean") {
        out.push(["Print Colour", cfg.is_color ? "Full colour" : "Black & white"]);
      }
      if (typeof cfg.is_duplex === "boolean") {
        out.push(["Print Sides", cfg.is_duplex ? "Double sided" : "Single sided"]);
      }
      if (cfg.binding_edge_override) {
        out.push(["Binding Edge", titleCase(String(cfg.binding_edge_override))]);
      }
      return out;
    };

    // Column layout (sum = W_in = 507)
    const C = {
      code:  { x: M,         w: 50 },
      desc:  { x: M + 50,    w: 175 },
      qty:   { x: M + 225,   w: 50 },
      unit:  { x: M + 275,   w: 60 },
      disc:  { x: M + 335,   w: 38 },
      vat:   { x: M + 373,   w: 42 },
      total: { x: M + 415,   w: W_in - 415 },
    };

    const drawItemsHeader = (yy: number): number => {
      page.drawRectangle({ x: M, y: yy - 14, width: W_in, height: 14, color: brandSoft });
      drawText(page, "Item Code",   C.code.x + 4,  yy - 11, { size: 8, bold: true });
      drawText(page, "Description", C.desc.x + 4,  yy - 11, { size: 8, bold: true });
      drawText(page, "Quantity",    C.qty.x,       yy - 11, { size: 8, bold: true, align: "right", width: C.qty.w - 4 });
      drawText(page, "Unit Price",  C.unit.x,      yy - 11, { size: 8, bold: true, align: "right", width: C.unit.w - 4 });
      drawText(page, "Disc %",      C.disc.x,      yy - 11, { size: 8, bold: true, align: "right", width: C.disc.w - 4 });
      drawText(page, "VAT %",       C.vat.x,       yy - 11, { size: 8, bold: true, align: "right", width: C.vat.w - 4 });
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

    // Spec block layout constants
    const specIndentX = C.desc.x + 8;
    const specBlockW = (W - M) - specIndentX - 4; // breakdown spans desc → right margin
    const specColW = specBlockW / 2;
    const specRowH = 10;

    for (const item of items) {
      const code = String(item.external_product_key ?? item.sequence_no ?? "");
      const name = String(item.job_name ?? item.product_name ?? "Item");
      const sub  = (item.product_category && item.product_category !== name) ? String(item.product_category) : "";

      const nameLines = wrap(name, font, 9, C.desc.w - 8);
      const subLines  = sub ? wrap(sub, font, 8, C.desc.w - 8) : [];

      const specs = buildSpecs(item);
      const specRows = Math.ceil(specs.length / 2);
      const specH = specs.length ? 4 + specRows * specRowH + 2 : 0;

      const rowH = Math.max(16, 4 + nameLines.length * 11 + subLines.length * 10 + specH + 4);

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

      // Specification breakdown — two columns of "Label: Value"
      if (specs.length) {
        ly -= 2;
        for (let i = 0; i < specs.length; i += 2) {
          const left = specs[i];
          const right = specs[i + 1];
          const drawPair = (pair: [string, string], xx: number) => {
            const labelTxt = `${pair[0]}: `;
            drawText(page, labelTxt, xx, ly, { size: 8, color: muted });
            const lw = font.widthOfTextAtSize(labelTxt, 8);
            const valMax = specColW - lw - 8;
            const valLines = wrap(pair[1], bold, 8, valMax);
            drawText(page, valLines[0] ?? "", xx + lw, ly, { size: 8, bold: true });
          };
          drawPair(left, specIndentX);
          if (right) drawPair(right, specIndentX + specColW);
          ly -= specRowH;
        }
        ly -= 2;
      }

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

    // Right column: Totals — label chip on the left half only, value sits in a
    // clean right-aligned cell so it never gets overdrawn.
    const sub = Number(q.subtotal ?? 0);
    const vat = Number(q.vat_amount ?? 0);
    const total = Number(q.total_amount ?? 0);
    const totalsW = W - M - rightX;
    const labelCellW = Math.min(140, Math.round(totalsW * 0.62));
    const totalRow = (label: string, value: string, opts: { bold?: boolean; size?: number; color?: RGB } = {}) => {
      const s = opts.size ?? 10;
      const rowH = s + 6;
      page.drawRectangle({ x: rightX, y: yR - 3, width: labelCellW, height: rowH, color: brandSoft });
      drawText(page, label, rightX + 6, yR, { size: s, bold: !!opts.bold, color: opts.color ?? dark });
      drawText(page, value, rightX + labelCellW + 6, yR, {
        size: s,
        bold: !!opts.bold,
        align: "right",
        width: totalsW - labelCellW - 6,
        color: opts.color ?? dark,
      });
      yR -= rowH + 4;
    };
    totalRow("Subtotal (Exclusive)", fmtMoney(sub, currency));
    totalRow("VAT", fmtMoney(vat, currency));
    yR -= 4;
    totalRow("Total", fmtMoney(total, currency), { bold: true, size: 12, color: brand });

    // Bottom disclaimer (above page footer)
    const disclaimer = "Please note: Our quote has been calculated on the cost of stock currently on hand, which is based on exchange rates applicable at the time of importation. Should there be a major fluctuation in the Rand: Foreign Exchange rates of the currency of our suppliers, we reserve the right to amend our quoted prices accordingly. This quote is subject to Credit Status Approval.";
    const dLines = wrap(disclaimer, font, 7, W_in);
    // Place block so its bottom line sits ~32pt above the page footer baseline.
    let yd = 32 + (dLines.length - 1) * 9;
    for (const ln of dLines) {
      drawText(page, ln, M, yd, { size: 7, color: muted });
      yd -= 9;
    }

    /* ─── Per-page footer: page numbers + created stamp ─── */
    const created = new Date();
    const createdTxt = `Created: ${created.toLocaleDateString("en-GB")} ${created.toLocaleTimeString("en-GB")}`;
    const createdW = font.widthOfTextAtSize(createdTxt, 7);
    pages.forEach((p, i) => {
      const pageLbl = `Page ${i + 1} of ${pages.length}`;
      drawText(p, pageLbl, M, 20, { size: 7, color: muted });
      p.drawText(createdTxt, { x: W - M - createdW, y: 20, size: 7, font, color: muted });
    });



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
