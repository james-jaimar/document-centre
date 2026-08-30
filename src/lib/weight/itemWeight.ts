/**
 * Database-backed weight resolution for a single order item.
 *
 * Pulls the real ingredients — printed sections and their paper gsm, the
 * chosen finishing/binding, and any keyed pack-ladder weight — and hands them
 * to the pure resolver. Called once when an item lands in the cart so the
 * weight is stamped on the spec and every later consumer (courier quote,
 * checkout summary, job ticket) reads the same number.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchWeightSettings } from "@/hooks/useWeightSettings";
import { packRowWeightGrams } from "@/lib/pricing/packOptions";
import { resolvePackBlocks } from "@/lib/storefront/catalogue";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import { gsmFromSlug, sheetWeightGrams } from "@/lib/weightCalculation";
import {
  resolveItemWeight,
  type ResolvedWeight,
  type WeightSection,
} from "./resolveItemWeight";

export interface ItemWeightRequest {
  orderItemId?: string | null;
  productFamilyId?: string | null;
  tenantId?: string | null;
  branchId?: string | null;
  spec: any;
  quantity: number;
}

function readSizeMm(spec: any): { w: number; h: number } {
  const size = spec?.size ?? {};
  const w = Number(size.width_mm ?? spec?.width_mm ?? spec?.trim_width_mm ?? 210);
  const h = Number(size.height_mm ?? spec?.height_mm ?? spec?.trim_height_mm ?? 297);
  return { w: Number.isFinite(w) ? w : 210, h: Number.isFinite(h) ? h : 297 };
}

function sizeCode(spec: any): string | null {
  return (spec?.size?.code ?? spec?.size_code ?? spec?.size ?? null) as string | null;
}

function paperCode(spec: any): string | null {
  return (spec?.paper?.code ?? spec?.paper_code ?? spec?.paper_stock ?? spec?.paper ?? null) as
    | string
    | null;
}

/** Sections straight from the document builder; falls back to the flat spec. */
async function loadSections(req: ItemWeightRequest): Promise<WeightSection[]> {
  const { w, h } = readSizeMm(req.spec);

  if (req.orderItemId) {
    const { data } = await supabase
      .from("document_sections")
      .select("page_range_start, page_range_end, paper_weight_gsm, paper_stock, is_duplex, lamination")
      .eq("order_item_id", req.orderItemId);

    const rows = data ?? [];
    if (rows.length > 0) {
      return rows.map((r: any) => {
        const start = Number(r.page_range_start ?? 1);
        const end = Number(r.page_range_end ?? start);
        const pageCount = Math.max(0, end - start + 1);
        const gsm =
          Number(r.paper_weight_gsm) ||
          (r.paper_stock ? gsmFromSlug(String(r.paper_stock)) : 80);
        return {
          pageCount,
          isDuplex: !!r.is_duplex,
          gsm,
          widthMm: w,
          heightMm: h,
          // Laminate film adds roughly 12gsm per laminated side.
          laminationGsm: r.lamination && r.lamination !== "none" ? 24 : 0,
        } satisfies WeightSection;
      });
    }
  }

  const pageCount = Number(req.spec?.page_count ?? req.spec?.total_pages ?? 0);
  if (pageCount > 0) {
    const gsm =
      Number(req.spec?.paper_gsm ?? req.spec?.gsm) ||
      (paperCode(req.spec) ? gsmFromSlug(String(paperCode(req.spec))) : 80);
    return [
      {
        pageCount,
        isDuplex: !!(req.spec?.is_duplex ?? req.spec?.duplex),
        gsm,
        widthMm: w,
        heightMm: h,
      },
    ];
  }
  return [];
}

/** Weight contributed by the chosen finishing / binding, per copy. */
async function loadFinishingGrams(spec: any): Promise<number> {
  const raw = String(spec?.selected_options?.finishing ?? "").trim();
  const codes = raw
    ? raw.split(",").map((c) => c.trim()).filter(Boolean)
    : [];
  if (codes.length === 0) return 0;
  const { data } = await supabase
    .from("catalog_finishing")
    .select("code, weight_grams")
    .in("code", codes);
  return (data ?? []).reduce((sum: number, r: any) => sum + (Number(r.weight_grams) || 0), 0);
}

/** Pack-ladder weight keyed by the admin, if the selection matches a row. */
async function loadPackRowGrams(req: ItemWeightRequest): Promise<number | null> {
  if (!req.productFamilyId) return null;
  const [{ data: family }, { data: overrides }] = await Promise.all([
    supabase
      .from("product_families")
      .select("id, quantity_blocks")
      .eq("id", req.productFamilyId)
      .maybeSingle(),
    req.tenantId
      ? (supabase as any)
          .from("product_pack_pricing_overrides")
          .select("branch_id, quantity_blocks")
          .eq("tenant_id", req.tenantId)
          .eq("product_family_id", req.productFamilyId)
      : Promise.resolve({ data: [] }),
  ]);
  if (!family) return null;

  const blocks = resolvePackBlocks(
    family as any,
    (overrides ?? []) as any,
    req.branchId ?? null,
  ) as QuantityBlock[];
  if (!blocks.length) return null;

  return packRowWeightGrams(blocks, {
    size: sizeCode(req.spec),
    paper: paperCode(req.spec),
    sides: req.spec?.is_duplex ? "double" : "single",
    option: req.spec?.pricing_option ?? null,
    qty: req.quantity,
  });
}

/** Full resolution for one cart/order line. Never throws — falls back to an estimate. */
export async function resolveOrderItemWeight(req: ItemWeightRequest): Promise<ResolvedWeight> {
  const quantity = Math.max(1, Number(req.quantity) || 1);
  const { w, h } = readSizeMm(req.spec);

  try {
    const [settings, sections, finishingGrams, packRowGrams] = await Promise.all([
      fetchWeightSettings(req.branchId, req.tenantId),
      loadSections(req),
      loadFinishingGrams(req.spec),
      loadPackRowGrams(req),
    ]);

    return resolveItemWeight({
      quantity,
      widthMm: w,
      heightMm: h,
      overrideGrams: Number(req.spec?.weight?.override_grams) || null,
      packRowGrams,
      sections,
      finishingGrams,
      settings,
    });
  } catch {
    return resolveItemWeight({
      quantity,
      widthMm: w,
      heightMm: h,
      fallbackPerCopyGrams: sheetWeightGrams(w, h, 80),
    });
  }
}

/** The compact record stamped onto `spec.weight`. */
export interface SpecWeight {
  grams: number;
  per_copy_grams: number;
  source: ResolvedWeight["source"];
  breakdown: ResolvedWeight["breakdown"];
  computed_at: string;
}

export function toSpecWeight(resolved: ResolvedWeight): SpecWeight {
  return {
    grams: Math.round(resolved.grams),
    per_copy_grams: Math.round(resolved.perCopyGrams * 100) / 100,
    source: resolved.source,
    breakdown: resolved.breakdown,
    computed_at: new Date().toISOString(),
  };
}
