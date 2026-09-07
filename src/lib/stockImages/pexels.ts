/**
 * Client helpers for the Pexels photo library (via the `stock-images` edge
 * function — the API key stays server-side).
 */
import { supabase } from "@/integrations/supabase/client";

export interface StockPhoto {
  id: number;
  width: number;
  height: number;
  thumb: string;
  preview: string;
  original: string;
  photographer: string;
  photographer_url: string;
  page_url: string;
  alt: string;
}

export interface StockSearchResult {
  photos: StockPhoto[];
  page: number;
  total: number | null;
  has_more: boolean;
}

export type StockOrientation = "landscape" | "portrait" | "square";

export async function searchStockPhotos(opts: {
  query: string;
  page?: number;
  perPage?: number;
  orientation?: StockOrientation;
  locale?: string;
  colour?: string;
  size?: "large" | "medium" | "small";
}): Promise<StockSearchResult> {
  const { data, error } = await supabase.functions.invoke("stock-images", {
    body: {
      action: "search",
      query: opts.query,
      page: opts.page ?? 1,
      per_page: opts.perPage ?? 24,
      orientation: opts.orientation,
      locale: opts.locale || undefined,
      colour: opts.colour || undefined,
      size: opts.size || undefined,
    },
  });
  if (error) throw new Error("Photo search is unavailable right now. Please try again.");
  if ((data as any)?.error) throw new Error("Photo search is unavailable right now.");
  return data as StockSearchResult;
}

/** Download a chosen photo's original bytes as a File, ready for upload. */
export async function fetchStockPhotoFile(photo: StockPhoto): Promise<File> {
  const { data, error } = await supabase.functions.invoke("stock-images", {
    body: { action: "fetch", url: photo.original },
  });
  if (error) throw new Error("Could not download that photo. Please try another.");
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: "image/jpeg" });
  const safeName = `pexels-${photo.id}-${(photo.photographer || "photo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)}.jpg`;
  return new File([blob], safeName, { type: blob.type || "image/jpeg" });
}

// ── Print-quality scoring ───────────────────────────────────────────

const MM_PER_INCH = 25.4;

export type StockQuality = "excellent" | "good" | "too-small";

/** DPI the photo achieves when it fills a box of the given size in mm. */
export function stockPhotoDpi(photo: StockPhoto, widthMm: number, heightMm: number): number {
  if (!widthMm || !heightMm) return 0;
  // "Fill" behaviour: the limiting axis is the one with the smaller ratio.
  const dpiW = photo.width / (widthMm / MM_PER_INCH);
  const dpiH = photo.height / (heightMm / MM_PER_INCH);
  return Math.round(Math.min(dpiW, dpiH));
}

export function stockPhotoQuality(
  photo: StockPhoto,
  widthMm: number,
  heightMm: number,
  thresholds?: { excellent?: number; good?: number },
): { quality: StockQuality; dpi: number } {
  const excellent = thresholds?.excellent ?? 240;
  const good = thresholds?.good ?? 150;
  const dpi = stockPhotoDpi(photo, widthMm, heightMm);
  if (dpi >= excellent) return { quality: "excellent", dpi };
  if (dpi >= good) return { quality: "good", dpi };
  return { quality: "too-small", dpi };
}

export const STOCK_CATEGORIES = [
  "Landscapes",
  "Wildlife",
  "Cape Town",
  "Ocean",
  "Mountains",
  "Abstract",
  "Seasons",
  "Flowers",
  "City",
  "Minimal",
];
