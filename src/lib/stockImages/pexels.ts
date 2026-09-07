/**
 * Client helpers for the Pexels photo library (via the `stock-images` edge
 * function — the API key stays server-side).
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

/**
 * Download a chosen photo's original bytes as a File, ready for upload.
 *
 * Uses a direct `fetch` (not `functions.invoke`) so the reply is read as
 * binary — the JS client decodes non-JSON replies as text, which corrupts
 * JPEG bytes.
 */
export async function fetchStockPhotoFile(photo: StockPhoto): Promise<File> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Your session has expired — please sign in again.");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/stock-images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "fetch", url: photo.original }),
  });
  if (!res.ok) throw new Error("Could not download that photo. Please try another.");

  const blob = await res.blob();
  if (!blob.size || !(blob.type || "").startsWith("image/")) {
    throw new Error("Could not download that photo. Please try another.");
  }

  const safeName = `pexels-${photo.id}-${(photo.photographer || "photo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)}.jpg`;
  const file = new File([blob], safeName, { type: blob.type || "image/jpeg" });

  // Sanity check: the bytes must actually decode as an image.
  await assertDecodableImage(file);
  return file;
}

function assertDecodableImage(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That photo could not be read. Please try another."));
    };
    img.src = url;
  });
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
