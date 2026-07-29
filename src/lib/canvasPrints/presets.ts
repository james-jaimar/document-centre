export interface CanvasPreset {
  id: string;
  label: string;
  frontWidthMm: number;
  frontHeightMm: number;
}

/** Fixed depth presets — matches SA canvas printer stock. */
export const WRAP_DEPTH_PRESETS_MM = [25, 38, 50] as const;
export type WrapDepthMm = typeof WRAP_DEPTH_PRESETS_MM[number];

export const DEFAULT_WRAP_MM: WrapDepthMm = 38;
export const DEFAULT_BLEED_MM = 5;
export const DEFAULT_DPI = 150;

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: "a4", label: "A4 (210 × 297 mm)", frontWidthMm: 210, frontHeightMm: 297 },
  { id: "a3", label: "A3 (297 × 420 mm)", frontWidthMm: 297, frontHeightMm: 420 },
  { id: "a2", label: "A2 (420 × 594 mm)", frontWidthMm: 420, frontHeightMm: 594 },
  { id: "a1", label: "A1 (594 × 841 mm)", frontWidthMm: 594, frontHeightMm: 841 },
  { id: "a0", label: "A0 (841 × 1189 mm)", frontWidthMm: 841, frontHeightMm: 1189 },
  { id: "sq-300", label: "300 × 300 mm", frontWidthMm: 300, frontHeightMm: 300 },
  { id: "sq-400", label: "400 × 400 mm", frontWidthMm: 400, frontHeightMm: 400 },
  { id: "sq-500", label: "500 × 500 mm", frontWidthMm: 500, frontHeightMm: 500 },
  { id: "sq-600", label: "600 × 600 mm", frontWidthMm: 600, frontHeightMm: 600 },
  { id: "sq-800", label: "800 × 800 mm", frontWidthMm: 800, frontHeightMm: 800 },
  { id: "sq-1000", label: "1000 × 1000 mm", frontWidthMm: 1000, frontHeightMm: 1000 },
];

export function findPreset(id: string): CanvasPreset | undefined {
  return CANVAS_PRESETS.find((p) => p.id === id);
}

export function totalWidthMm(front: number, wrapMm: number, bleedMm: number) {
  return front + (wrapMm + bleedMm) * 2;
}
export function totalHeightMm(front: number, wrapMm: number, bleedMm: number) {
  return front + (wrapMm + bleedMm) * 2;
}

export function mmToPx(mm: number, dpi: number) {
  return Math.round((mm / 25.4) * dpi);
}

export function requiredPixels(frontWidthMm: number, frontHeightMm: number, wrapMm: number, bleedMm: number, dpi: number) {
  return {
    width: mmToPx(totalWidthMm(frontWidthMm, wrapMm, bleedMm), dpi),
    height: mmToPx(totalHeightMm(frontHeightMm, wrapMm, bleedMm), dpi),
  };
}
