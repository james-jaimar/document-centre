/**
 * Print size catalogue for the Photo Prints product family.
 * Each entry holds the physical dimensions and aspect ratio used by
 * react-easy-crop to constrain the crop frame, plus pricing metadata.
 */

export interface PhotoPrintSize {
  slug: string;
  label: string;
  width_mm: number;
  height_mm: number;
  /** width / height — used by react-easy-crop's `aspect` prop */
  aspect: number;
  unit_price: number;
  /** Min long-edge pixel count for ≥150 DPI at this size */
  min_pixels_long_edge: number;
  /** Min long-edge pixel count for ≥300 DPI at this size (used to flag ideal vs acceptable) */
  ideal_pixels_long_edge: number;
}

const MM_PER_INCH = 25.4;

function pixelsForDpi(longEdgeMm: number, dpi: number): number {
  return Math.round((longEdgeMm / MM_PER_INCH) * dpi);
}

const define = (
  slug: string,
  label: string,
  width_mm: number,
  height_mm: number,
  unit_price: number,
): PhotoPrintSize => {
  const longEdgeMm = Math.max(width_mm, height_mm);
  return {
    slug,
    label,
    width_mm,
    height_mm,
    aspect: width_mm / height_mm,
    unit_price,
    min_pixels_long_edge: pixelsForDpi(longEdgeMm, 150),
    ideal_pixels_long_edge: pixelsForDpi(longEdgeMm, 300),
  };
};

export const PHOTO_PRINT_SIZES: PhotoPrintSize[] = [
  define("4x6", '4×6" (102×152 mm)', 152, 102, 3.5),
  define("5x7", '5×7" (127×178 mm)', 178, 127, 5.5),
  define("6x8", '6×8" (152×203 mm)', 203, 152, 8.0),
  define("8x10", '8×10" (203×254 mm)', 254, 203, 12.0),
  define("a4", "A4 (210×297 mm)", 297, 210, 15.0),
];

export const DEFAULT_PHOTO_PRINT_SIZE_SLUG = "4x6";

export function getPhotoPrintSize(slug: string | null | undefined): PhotoPrintSize {
  if (!slug) return PHOTO_PRINT_SIZES[0];
  return PHOTO_PRINT_SIZES.find((s) => s.slug === slug) ?? PHOTO_PRINT_SIZES[0];
}

export const PHOTO_FINISH_OPTIONS = [
  { slug: "gloss", label: "Gloss", is_default: true },
  { slug: "matte", label: "Matte", is_default: false },
] as const;

export const PHOTO_BORDER_OPTIONS = [
  { slug: "none", label: "No Border", is_default: true, border_mm: 0 },
  { slug: "white_3mm", label: "White Border (3 mm)", is_default: false, border_mm: 3 },
] as const;
