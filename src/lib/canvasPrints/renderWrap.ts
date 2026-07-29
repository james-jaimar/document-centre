import type { CanvasTransformState, WrapMode } from "./types";
import { mmToPx, totalWidthMm, totalHeightMm } from "./presets";

/**
 * Render the composed production artwork (front + all four wrap strips) to
 * an offscreen canvas. Wrap-mode composition now uses a *separate* source
 * canvas so we never read+write the same bitmap under a transform (which is
 * why Mirror / Blur previously appeared broken).
 */
export function renderProductionCanvas(
  image: HTMLImageElement | HTMLCanvasElement,
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

  // ── Source canvas: the image drawn at the full production extent, using
  // the user's pan/zoom/rotate. Everything else reads from this.
  const source = document.createElement("canvas");
  source.width = totalWpx;
  source.height = totalHpx;
  const sctx = source.getContext("2d")!;
  sctx.imageSmoothingQuality = "high";
  sctx.fillStyle = "#ffffff";
  sctx.fillRect(0, 0, totalWpx, totalHpx);

  const srcW = "naturalWidth" in image ? image.naturalWidth : image.width;
  const srcH = "naturalHeight" in image ? image.naturalHeight : image.height;
  const src = { w: srcW, h: srcH };
  const rot = ((state.imageRotation % 360) + 360) % 360;
  const srcAspect = rot === 90 || rot === 270 ? src.h / src.w : src.w / src.h;

  const frontAspect = frontWpx / frontHpx;
  let baseFrontW: number, baseFrontH: number;
  if (srcAspect > frontAspect) {
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

  sctx.save();
  sctx.translate(centerX, centerY);
  sctx.rotate((rot * Math.PI) / 180);
  const dw = rot === 90 || rot === 270 ? drawH : drawW;
  const dh = rot === 90 || rot === 270 ? drawW : drawH;
  sctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
  sctx.restore();

  // ── Composed canvas: what we ship as the proof.
  const canvas = document.createElement("canvas");
  canvas.width = totalWpx;
  canvas.height = totalHpx;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalWpx, totalHpx);

  const outer = wrapPx + bleedPx; // strip thickness

  if (wrapMode === "gallery_wrap") {
    ctx.drawImage(source, 0, 0);
  } else if (wrapMode === "face_only" || wrapMode === "no_edge_print") {
    // Face only — sides stay white.
    ctx.drawImage(source, insetPx, insetPx, frontWpx, frontHpx, insetPx, insetPx, frontWpx, frontHpx);
  } else {
    // Draw face first.
    ctx.drawImage(source, insetPx, insetPx, frontWpx, frontHpx, insetPx, insetPx, frontWpx, frontHpx);

    if (wrapMode === "mirror_wrap") {
      fillMirrorStrips(ctx, source, insetPx, frontWpx, frontHpx, outer, totalWpx, totalHpx);
    } else if (wrapMode === "blur_wrap") {
      fillBlurStrips(ctx, source, insetPx, frontWpx, frontHpx, outer, totalWpx, totalHpx);
    } else if (wrapMode === "colour_wrap") {
      const colour = wrapColorHex || sampleEdgeColour(sctx, insetPx, frontWpx, frontHpx);
      fillColourStrips(ctx, insetPx, frontWpx, frontHpx, outer, totalWpx, totalHpx, colour);
    }
  }

  return canvas;
}

/**
 * Return one canvas per face for the 3D preview. Front is the composed
 * front-face rect; the four side faces mirror what will actually wrap.
 * Back is white (nothing prints on the back).
 */
export function renderFaceBitmaps(
  image: HTMLImageElement,
  state: CanvasTransformState,
  previewDpi: number,
): {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  top: HTMLCanvasElement;
  bottom: HTMLCanvasElement;
  left: HTMLCanvasElement;
  right: HTMLCanvasElement;
} {
  const composed = renderProductionCanvas(image, state, previewDpi);
  const r = faceRect(state, previewDpi);

  const face = (w: number, h: number, sx: number, sy: number, sw: number, sh: number) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    c.getContext("2d")!.drawImage(composed, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  };

  const front = face(r.w, r.h, r.x, r.y, r.w, r.h);
  // Side strips = wrap band from the composed canvas, sized to physical depth × edge length.
  const right = face(r.wrapPx, r.h, r.x + r.w, r.y, r.wrapPx, r.h);
  const left = face(r.wrapPx, r.h, r.x - r.wrapPx, r.y, r.wrapPx, r.h);
  const top = face(r.w, r.wrapPx, r.x, r.y - r.wrapPx, r.w, r.wrapPx);
  const bottom = face(r.w, r.wrapPx, r.x, r.y + r.h, r.w, r.wrapPx);

  const back = document.createElement("canvas");
  back.width = Math.max(1, Math.round(r.w));
  back.height = Math.max(1, Math.round(r.h));
  const bctx = back.getContext("2d")!;
  bctx.fillStyle = "#f8f8f8";
  bctx.fillRect(0, 0, back.width, back.height);

  return { front, back, top, bottom, left, right };
}

// ──────────────────────────────────────────────────────────────────────────
// Wrap strip fillers — read from `source`, write to `ctx` (composed).
// ──────────────────────────────────────────────────────────────────────────

function fillMirrorStrips(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  inset: number,
  fw: number,
  fh: number,
  outer: number,
  totalW: number,
  totalH: number,
) {
  // Left strip: mirror the leftmost `outer`px of the face horizontally.
  ctx.save();
  ctx.translate(inset, inset);
  ctx.scale(-1, 1);
  ctx.drawImage(source, inset, inset, outer, fh, -outer, 0, outer, fh);
  ctx.restore();
  // Right strip
  ctx.save();
  ctx.translate(inset + fw, inset);
  ctx.scale(-1, 1);
  ctx.drawImage(source, inset + fw - outer, inset, outer, fh, -outer, 0, outer, fh);
  ctx.restore();
  // Top strip (full width, incl. corners from now-mirrored sides)
  const rowSource = document.createElement("canvas");
  rowSource.width = totalW; rowSource.height = outer;
  rowSource.getContext("2d")!.drawImage(ctx.canvas, 0, inset, totalW, outer, 0, 0, totalW, outer);
  ctx.save();
  ctx.translate(0, inset);
  ctx.scale(1, -1);
  ctx.drawImage(rowSource, 0, -outer);
  ctx.restore();
  // Bottom strip
  const rowSourceB = document.createElement("canvas");
  rowSourceB.width = totalW; rowSourceB.height = outer;
  rowSourceB.getContext("2d")!.drawImage(ctx.canvas, 0, inset + fh - outer, totalW, outer, 0, 0, totalW, outer);
  ctx.save();
  ctx.translate(0, inset + fh);
  ctx.scale(1, -1);
  ctx.drawImage(rowSourceB, 0, 0);
  ctx.restore();
}

function fillBlurStrips(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  inset: number,
  fw: number,
  fh: number,
  outer: number,
  totalW: number,
  totalH: number,
) {
  // Pre-blur the source into an offscreen so canvas.filter is only applied once.
  const blurred = document.createElement("canvas");
  blurred.width = source.width; blurred.height = source.height;
  const bctx = blurred.getContext("2d")!;
  bctx.filter = "blur(10px)";
  bctx.drawImage(source, 0, 0);
  bctx.filter = "none";

  // Stretch a 2px edge slice of the blurred face across each strip.
  // Left
  ctx.drawImage(blurred, inset, inset, 2, fh, 0, inset, outer, fh);
  // Right
  ctx.drawImage(blurred, inset + fw - 2, inset, 2, fh, inset + fw, inset, outer, fh);
  // Top (across whole width, incl. now-filled sides)
  ctx.drawImage(ctx.canvas, 0, inset, totalW, 2, 0, 0, totalW, outer);
  // Bottom
  ctx.drawImage(ctx.canvas, 0, inset + fh - 2, totalW, 2, 0, inset + fh, totalW, outer);
}

function fillColourStrips(
  ctx: CanvasRenderingContext2D,
  inset: number,
  fw: number,
  fh: number,
  outer: number,
  totalW: number,
  totalH: number,
  colour: string,
) {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, totalW, inset);             // top band (full width incl. corners)
  ctx.fillRect(0, inset + fh, totalW, inset);    // bottom band
  ctx.fillRect(0, inset, inset, fh);             // left
  ctx.fillRect(inset + fw, inset, inset, fh);    // right
}

/** Average the top 4-px strip of the face — used as default for colour_wrap. */
export function sampleEdgeColour(
  ctx: CanvasRenderingContext2D,
  inset: number,
  fw: number,
  fh: number,
): string {
  try {
    const strip = 4;
    const data = ctx.getImageData(inset, inset, Math.min(fw, ctx.canvas.width - inset), strip).data;
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
