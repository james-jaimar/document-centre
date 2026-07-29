import type { CanvasTransformState, WrapMode } from "./types";
import { mmToPx, totalWidthMm, totalHeightMm } from "./presets";

/**
 * Render the composed production artwork (front + all four wrap strips) to
 * an offscreen canvas. Both FlatProofPreview and AngledPreview consume this
 * so the sides visibly match the flat proof.
 *
 * `previewDpi` lets us render a lightweight preview (~72 dpi) rather than
 * the full 150 dpi print resolution.
 */
export function renderProductionCanvas(
  image: HTMLImageElement,
  state: CanvasTransformState,
  previewDpi: number,
): HTMLCanvasElement {
  const { frontWidthMm, frontHeightMm, wrapMm, bleedMm, wrapMode, wrapColorHex } = state;

  const totalWpx = mmToPx(totalWidthMm(frontWidthMm, wrapMm, bleedMm), previewDpi);
  const totalHpx = mmToPx(totalHeightMm(frontHeightMm, wrapMm, bleedMm), previewDpi);
  const frontWpx = mmToPx(frontWidthMm, previewDpi);
  const frontHpx = mmToPx(frontHeightMm, previewDpi);
  const wrapPx = mmToPx(wrapMm, previewDpi);
  const bleedPx = mmToPx(bleedMm, previewDpi);
  const insetPx = wrapPx + bleedPx;

  const canvas = document.createElement("canvas");
  canvas.width = totalWpx;
  canvas.height = totalHpx;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";

  // Background — matters for face_only + as a safety fallback.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalWpx, totalHpx);

  // Compute the front-face placement of the source image using the transform
  // state. imageScale=1 == fit-cover baseline (image fills the front face).
  const src = { w: image.naturalWidth, h: image.naturalHeight };
  const rot = ((state.imageRotation % 360) + 360) % 360;
  const srcAspect = rot === 90 || rot === 270 ? src.h / src.w : src.w / src.h;
  const frontAspect = frontWpx / frontHpx;
  let baseFrontW: number, baseFrontH: number;
  if (srcAspect > frontAspect) {
    // image wider than front → fit height, overflow width
    baseFrontH = frontHpx;
    baseFrontW = frontHpx * srcAspect;
  } else {
    baseFrontW = frontWpx;
    baseFrontH = frontWpx / srcAspect;
  }
  const drawW = baseFrontW * state.imageScale;
  const drawH = baseFrontH * state.imageScale;

  const centerX = insetPx + frontWpx / 2 + state.imageX;
  const centerY = insetPx + frontHpx / 2 + state.imageY;

  const drawImage = (target: CanvasRenderingContext2D) => {
    target.save();
    target.translate(centerX, centerY);
    target.rotate((rot * Math.PI) / 180);
    // When rotated 90/270, swap the draw dimensions so orientation is
    // consistent with the aspect calc above.
    const dw = rot === 90 || rot === 270 ? drawH : drawW;
    const dh = rot === 90 || rot === 270 ? drawW : drawH;
    target.drawImage(image, -dw / 2, -dh / 2, dw, dh);
    target.restore();
  };

  // ── Front + wrap-mode strips ─────────────────────────────────────────────
  if (wrapMode === "gallery_wrap") {
    // Image bleeds naturally across the entire production area.
    drawImage(ctx);
  } else if (wrapMode === "face_only") {
    // Only the front prints — leave wraps + bleed white.
    ctx.save();
    ctx.beginPath();
    ctx.rect(insetPx, insetPx, frontWpx, frontHpx);
    ctx.clip();
    drawImage(ctx);
    ctx.restore();
  } else {
    // mirror / blur / colour → draw front first, then fill wraps.
    ctx.save();
    ctx.beginPath();
    ctx.rect(insetPx, insetPx, frontWpx, frontHpx);
    ctx.clip();
    drawImage(ctx);
    ctx.restore();

    if (wrapMode === "mirror_wrap") {
      fillMirrorStrips(ctx, insetPx, frontWpx, frontHpx, wrapPx, bleedPx, totalWpx, totalHpx);
    } else if (wrapMode === "blur_wrap") {
      fillBlurStrips(ctx, insetPx, frontWpx, frontHpx, wrapPx, bleedPx, totalWpx, totalHpx);
    } else if (wrapMode === "colour_wrap") {
      const colour = wrapColorHex || sampleEdgeColour(ctx, insetPx, frontWpx, frontHpx);
      fillColourStrips(ctx, insetPx, frontWpx, frontHpx, wrapPx, bleedPx, totalWpx, totalHpx, colour);
    }
  }

  return canvas;
}

// ──────────────────────────────────────────────────────────────────────────
// Wrap strip fillers — all operate on the composed canvas after the front
// image has been drawn into the visible face.
// ──────────────────────────────────────────────────────────────────────────

function fillMirrorStrips(
  ctx: CanvasRenderingContext2D,
  inset: number,
  fw: number,
  fh: number,
  wrap: number,
  bleed: number,
  totalW: number,
  totalH: number,
) {
  const outer = wrap + bleed;
  // Left strip: mirror leftmost `outer` px of the front horizontally.
  ctx.save();
  ctx.translate(inset, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(ctx.canvas, inset, inset, outer, fh, 0, inset, outer, fh);
  ctx.restore();
  // Right strip
  ctx.save();
  ctx.translate(inset + fw + outer, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(ctx.canvas, inset + fw - outer, inset, outer, fh, 0, inset, outer, fh);
  ctx.restore();
  // Top strip (mirror top `outer` px of the whole width incl. now-filled sides)
  ctx.save();
  ctx.translate(0, inset);
  ctx.scale(1, -1);
  ctx.drawImage(ctx.canvas, 0, inset, totalW, outer, 0, 0, totalW, outer);
  ctx.restore();
  // Bottom strip
  ctx.save();
  ctx.translate(0, inset + fh + outer);
  ctx.scale(1, -1);
  ctx.drawImage(ctx.canvas, 0, inset + fh - outer, totalW, outer, 0, 0, totalW, outer);
  ctx.restore();
}

function fillBlurStrips(
  ctx: CanvasRenderingContext2D,
  inset: number,
  fw: number,
  fh: number,
  wrap: number,
  bleed: number,
  totalW: number,
  totalH: number,
) {
  const outer = wrap + bleed;
  // Cheap "blur" = stretch a 1-2px edge slice over the strip. Good enough for preview.
  // Left
  ctx.save();
  ctx.filter = "blur(6px)";
  ctx.drawImage(ctx.canvas, inset, inset, 2, fh, 0, inset, outer, fh);
  // Right
  ctx.drawImage(ctx.canvas, inset + fw - 2, inset, 2, fh, inset + fw, inset, outer, fh);
  // Top (across full width)
  ctx.drawImage(ctx.canvas, 0, inset, totalW, 2, 0, 0, totalW, outer);
  // Bottom
  ctx.drawImage(ctx.canvas, 0, inset + fh - 2, totalW, 2, 0, inset + fh, totalW, outer);
  ctx.restore();
}

function fillColourStrips(
  ctx: CanvasRenderingContext2D,
  inset: number,
  fw: number,
  fh: number,
  wrap: number,
  bleed: number,
  totalW: number,
  totalH: number,
  colour: string,
) {
  const outer = wrap + bleed;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, totalW, outer + inset - outer); // top full width
  ctx.fillRect(0, inset + fh, totalW, outer);        // bottom full width
  ctx.fillRect(0, inset, outer, fh);                 // left
  ctx.fillRect(inset + fw, inset, outer, fh);        // right
}

/** Sample the average edge colour of the front face — used as the default
 *  for `colour_wrap`. */
export function sampleEdgeColour(
  ctx: CanvasRenderingContext2D,
  inset: number,
  fw: number,
  fh: number,
): string {
  try {
    const strip = 4;
    const data = ctx.getImageData(inset, inset, fw, strip).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    if (n === 0) return "#ffffff";
    const toHex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch {
    return "#ffffff";
  }
}

export function sampleEdgeColourFromImage(image: HTMLImageElement): string {
  const c = document.createElement("canvas");
  c.width = Math.min(image.naturalWidth, 200);
  c.height = Math.min(image.naturalHeight, 200);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(image, 0, 0, c.width, c.height);
  return sampleEdgeColour(ctx, 0, c.width, c.height);
}

/** Face-boundary rects in the composed canvas coordinate system. */
export function faceRect(state: CanvasTransformState, previewDpi: number) {
  const insetPx = mmToPx(state.wrapMm + state.bleedMm, previewDpi);
  return {
    x: insetPx,
    y: insetPx,
    w: mmToPx(state.frontWidthMm, previewDpi),
    h: mmToPx(state.frontHeightMm, previewDpi),
    wrapPx: mmToPx(state.wrapMm, previewDpi),
    bleedPx: mmToPx(state.bleedMm, previewDpi),
  };
}
