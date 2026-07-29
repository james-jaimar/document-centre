/**
 * Per-canvas entry stored on `order_items.spec.canvas_prints.canvases[]`.
 * Mirrors the shape of PhotoPrintEntry so the tile/editor patterns port over.
 */

import type { CroppedAreaPixels, PhotoCrop, PhotoFitMode } from "@/lib/photoPrints/types";
import type { PageOrientation, WrapMode } from "./types";


export interface CanvasPrintEntry {
  id: string;
  document_id: string;
  file_name: string;
  original_storage_path: string;
  source_width_px: number;
  source_height_px: number;
  mime_type: string;

  /** Whether the original upload was a PDF (we rasterised page 1 for editing). */
  source_was_pdf?: boolean;

  /** Chosen finished size (per canvas). */
  size_slug: string;
  frontWidthMm: number;
  frontHeightMm: number;
  /** Landscape (default) vs portrait — swaps the effective W/H at render time. */
  pageOrientation?: PageOrientation;


  /** Wrap depth in mm — one of the allowed presets (25/38/50). */
  wrapMm: number;
  /** Bleed added around the wrap. */
  bleedMm: number;
  /** Print DPI target. */
  dpi: number;
  /** Edge finish style. */
  wrapMode: WrapMode;
  wrapColorHex?: string;

  /** react-easy-crop state (matches PhotoPrintEntry). */
  crop: PhotoCrop;
  zoom: number;
  rotation: number;
  fit_mode: PhotoFitMode;
  croppedAreaPixels: CroppedAreaPixels | null;

  quantity: number;

  /** Derivative paths (thumb / preview) — same optional shape as PhotoPrintEntry. */
  thumb_path?: string;
  preview_path?: string;
  preview_width_px?: number;
  preview_height_px?: number;
}

export interface CanvasPrintsSpec {
  canvases: CanvasPrintEntry[];
}
