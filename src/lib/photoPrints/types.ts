/**
 * Types for the Photo Prints product family.
 *
 * A PhotoPrintEntry describes one uploaded photo and its crop/zoom/rotation
 * inside the chosen print frame. The original image lives in the `documents`
 * table; the entry references it by `document_id`.
 *
 * The full PhotoPrintsSpec lives on `order_items.spec.photo_prints` and is
 * also stored on the spec's `selected_options` for pricing-rule matching.
 */

export interface PhotoCrop {
  x: number;
  y: number;
}

export interface CroppedAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PhotoFitMode = "fill" | "fit";

export interface PhotoPrintEntry {
  /** Unique within the order_item — used as React key. */
  id: string;
  document_id: string;
  file_name: string;
  /** S3 path of the original uploaded image. */
  original_storage_path: string;
  /** Original image pixel dimensions (used for low-res calculation). */
  source_width_px: number;
  source_height_px: number;
  /** mime type of the original (image/jpeg, image/png, image/webp, image/heic). */
  mime_type: string;

  /** Snapshot of the global print size at the moment the photo was added. */
  print_size_slug: string;

  /** react-easy-crop state */
  crop: PhotoCrop;
  zoom: number;
  rotation: number;
  fit_mode: PhotoFitMode;

  /** The pixel rect on the source image that the backend should crop to. */
  croppedAreaPixels: CroppedAreaPixels | null;

  /** Per-photo print quantity. */
  quantity: number;

  /** Optional client-side preview thumbnail (data-url or signed URL). Not authoritative. */
  thumbnail_url?: string | null;
}

export interface PhotoPrintsSpec {
  print_size_slug: string;
  finish_slug: string;
  border_slug: string;
  photos: PhotoPrintEntry[];
}
