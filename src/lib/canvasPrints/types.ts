export type WrapMode =
  | "no_edge_print"
  | "gallery_wrap"
  | "mirror_wrap"
  | "blur_wrap"
  | "colour_wrap"
  | "face_only";

export const WRAP_MODE_OPTIONS: { value: WrapMode; label: string; help: string }[] = [
  {
    value: "no_edge_print",
    label: "No edge print",
    help: "Only the front prints. Wrapped sides are left blank white — the cleanest, most economical finish.",
  },
  {
    value: "gallery_wrap",
    label: "Gallery wrap",
    help: "Your image continues around the canvas sides. Keep important faces/text inside the front safe area.",
  },
  {
    value: "mirror_wrap",
    label: "Mirror wrap",
    help: "The front image stays intact. The sides are filled by mirroring the image edges.",
  },
  {
    value: "blur_wrap",
    label: "Blur wrap",
    help: "The front stays intact. The sides use a soft blurred stretch of the edge.",
  },
  {
    value: "colour_wrap",
    label: "Colour wrap",
    help: "The front stays intact. The sides are a solid colour (auto-picked from the image edge, or pick your own).",
  },
  {
    value: "face_only",
    label: "Face only",
    help: "Only the front prints. Sides are left blank white.",
  },
];

export interface CanvasTransformState {
  presetId: string;
  frontWidthMm: number;
  frontHeightMm: number;
  wrapMm: number;
  bleedMm: number;
  dpi: number;
  wrapMode: WrapMode;
  wrapColorHex?: string;
  /** Uniform scale multiplier applied to the image (1 = fit-cover baseline). */
  imageScale: number;
  /** Pan offsets in px on the production canvas (0,0 = centered). */
  imageX: number;
  imageY: number;
  /** Rotation in degrees, quantised to 0/90/180/270. */
  imageRotation: number;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
}
