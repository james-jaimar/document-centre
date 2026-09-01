/**
 * Client-side compositing for templated artwork previews.
 *
 * The preview draws the rasterised template page and stamps the customer's
 * content into each placeholder box. This is a PROOF only — production output
 * is composed server-side from the original PDF and full-resolution uploads.
 */

import {
  DEFAULT_CMYK,
  DEFAULT_TEXT_STYLE,
  cmykToHex,
  fontCss,
  placeholdersForPage,
  splitByLayer,
  type ArtworkPlaceholder,
  type TemplatedImageValue,
  type TemplatedPlaceholderValue,
} from "./types";



export interface BoxRectPx {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

/** Convert a placeholder's mm geometry into pixels for a page drawn at `scale`
 *  pixels per millimetre. */
export function boxRectPx(p: ArtworkPlaceholder, pxPerMm: number): BoxRectPx {
  return {
    x: p.x_mm * pxPerMm,
    y: p.y_mm * pxPerMm,
    w: p.width_mm * pxPerMm,
    h: p.height_mm * pxPerMm,
    r: (p.corner_radius_mm ?? 0) * pxPerMm,
  };
}

function roundedPath(ctx: CanvasRenderingContext2D, r: BoxRectPx) {
  const radius = Math.max(0, Math.min(r.r, Math.min(r.w, r.h) / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + radius, r.y);
  ctx.lineTo(r.x + r.w - radius, r.y);
  ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + radius);
  ctx.lineTo(r.x + r.w, r.y + r.h - radius);
  ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - radius, r.y + r.h);
  ctx.lineTo(r.x + radius, r.y + r.h);
  ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - radius);
  ctx.lineTo(r.x, r.y + radius);
  ctx.quadraticCurveTo(r.x, r.y, r.x + radius, r.y);
  ctx.closePath();
}

/** Where the image lands inside the box, honouring fit/fill + zoom + pan. */
export function imageDrawRect(
  box: BoxRectPx,
  imgW: number,
  imgH: number,
  value: Pick<TemplatedImageValue, "fit" | "scale" | "offset_x" | "offset_y">,
) {
  if (!imgW || !imgH) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const boxRatio = box.w / box.h;
  const imgRatio = imgW / imgH;
  const cover = value.fit !== "fit";
  const fitScale =
    cover === (imgRatio > boxRatio)
      ? box.h / imgH // cover & wide image, or contain & tall image
      : box.w / imgW;
  const s = fitScale * Math.max(0.1, value.scale || 1);
  const w = imgW * s;
  const h = imgH * s;
  const spareX = box.w - w;
  const spareY = box.h - h;
  const ox = (value.offset_x ?? 0) * (Math.abs(spareX) / 2);
  const oy = (value.offset_y ?? 0) * (Math.abs(spareY) / 2);
  return {
    x: box.x + spareX / 2 + ox,
    y: box.y + spareY / 2 + oy,
    w,
    h,
  };
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

export interface ComposeOptions {
  pageImage: CanvasImageSource | null;
  /** Natural pixel size of the page image. */
  pageWidthPx: number;
  pageHeightPx: number;
  trimWidthMm: number;
  /** Trim height — only needed when a trim line is drawn. */
  trimHeightMm?: number;
  /** Bleed included in the page image, in mm per side (default 0). */
  bleedLeftMm?: number;
  bleedTopMm?: number;
  /** Full canvas width in mm (trim + left + right bleed). Defaults to trim. */
  canvasWidthMm?: number;
  /** Draw a dashed trim line and dim the bleed margin (proofs/preview only). */
  showTrimLine?: boolean;
  placeholders: ArtworkPlaceholder[];
  values: Record<string, TemplatedPlaceholderValue | undefined>;
  images: Record<string, HTMLImageElement | undefined>;
  /** Zero-based page being drawn — restricts single-page placeholders. */
  pageIndex?: number;
  showBoxes?: boolean;
  /** Highlighted placeholder id (drawn with an accent outline). */
  activeId?: string | null;
}


/** Id of the sibling box whose value this box borrows via `field_key`. */
function sharedSourceId(p: ArtworkPlaceholder, opts: ComposeOptions): string | null {
  const key = (p.field_key ?? "").trim();
  if (!key || opts.values[p.id]) return null;
  const src = opts.placeholders.find(
    (d) => d.id !== p.id && (d.field_key ?? "").trim() === key && !!opts.values[d.id],
  );
  return src?.id ?? null;
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  p: ArtworkPlaceholder,
  opts: ComposeOptions,
  pxPerMm: number,
) {
  const box = boxRectPx(p, pxPerMm);
  // Boxes tagged with the same shared field name reuse one customer value.
  const sharedId = sharedSourceId(p, opts);
  const value = opts.values[p.id] ?? (sharedId ? opts.values[sharedId] : undefined);
  const alpha = Math.max(0, Math.min(1, value?.opacity ?? p.opacity ?? 1));

  if (p.kind === "colour") {
    const cmyk =
      value && value.kind === "colour" ? value.cmyk : (p.default_cmyk ?? DEFAULT_CMYK);
    ctx.save();
    ctx.globalAlpha = alpha;
    roundedPath(ctx, box);
    ctx.clip();
    ctx.fillStyle = cmykToHex(cmyk);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
  } else if (p.kind === "image") {
    const img = opts.images[p.id] ?? (sharedId ? opts.images[sharedId] : undefined);
    const bg = (value && "background_hex" in value ? value.background_hex : null) ?? p.background_hex;
    ctx.save();
    ctx.globalAlpha = alpha;
    roundedPath(ctx, box);
    ctx.clip();
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    if (img && value && value.kind === "image") {
      const r = imageDrawRect(box, img.naturalWidth, img.naturalHeight, value);
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  } else {

    const style = { ...DEFAULT_TEXT_STYLE, ...(p.text_style ?? {}) };
    const raw = (value && value.kind === "text" ? value.value : "") || p.default_value || "";
    const text = style.uppercase ? raw.toUpperCase() : raw;
    if (text.trim()) {
      // 1pt = 1/72 inch = 25.4/72 mm
      const sizePx = (style.fontSizePt * (25.4 / 72)) * pxPerMm;
      ctx.save();
      ctx.globalAlpha = alpha;
      roundedPath(ctx, box);
      ctx.clip();
      ctx.fillStyle = style.colorHex;
      ctx.font = `${style.fontStyle === "italic" ? "italic " : ""}${style.fontWeight === "bold" ? "700 " : "400 "}${sizePx}px ${fontCss(style.fontFamily)}`;
      ctx.textBaseline = "top";
      ctx.textAlign = style.align === "center" ? "center" : style.align === "right" ? "right" : "left";
      const lines = wrapLines(ctx, text, box.w);
      const lineH = sizePx * (style.lineHeight || 1.2);
      const blockH = lines.length * lineH;
      let y =
        style.verticalAlign === "top"
          ? box.y
          : style.verticalAlign === "bottom"
            ? box.y + box.h - blockH
            : box.y + (box.h - blockH) / 2;
      const x =
        style.align === "center" ? box.x + box.w / 2 : style.align === "right" ? box.x + box.w : box.x;
      for (const line of lines) {
        ctx.fillText(line, x, y);
        y += lineH;
      }
      ctx.restore();
    }
  }
}

function outlineBox(
  ctx: CanvasRenderingContext2D,
  p: ArtworkPlaceholder,
  opts: ComposeOptions,
  pxPerMm: number,
) {
  const box = boxRectPx(p, pxPerMm);
  ctx.save();
  const active = opts.activeId === p.id;
  const under = p.layer === "under";
  ctx.strokeStyle = under
    ? active
      ? "rgba(217,119,6,0.95)"
      : "rgba(217,119,6,0.5)"
    : active
      ? "rgba(37,99,235,0.95)"
      : "rgba(37,99,235,0.45)";
  ctx.lineWidth = Math.max(1, pxPerMm * (active ? 0.7 : 0.4));
  ctx.setLineDash(active ? [] : [pxPerMm * 2, pxPerMm * 1.5]);
  roundedPath(ctx, box);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the template page plus all customer content into `ctx`. Coordinates are
 * in the canvas' own pixel space, which must match pageWidthPx/pageHeightPx.
 *
 * Draw order: `under` placeholders → template page → `over` placeholders.
 * For `under` boxes to be visible the template page image must have a
 * transparent background (see the knockout option in `pdfPages.ts`).
 */
export function composeTemplatePage(
  ctx: CanvasRenderingContext2D,
  opts: ComposeOptions,
) {
  const { pageWidthPx, pageHeightPx, trimWidthMm } = opts;
  ctx.clearRect(0, 0, pageWidthPx, pageHeightPx);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);

  const canvasWidthMm = opts.canvasWidthMm && opts.canvasWidthMm > 0 ? opts.canvasWidthMm : trimWidthMm;
  const pxPerMm = canvasWidthMm > 0 ? pageWidthPx / canvasWidthMm : 1;
  const offsetXPx = (opts.bleedLeftMm ?? 0) * pxPerMm;
  const offsetYPx = (opts.bleedTopMm ?? 0) * pxPerMm;
  const forPage =
    opts.pageIndex == null
      ? opts.placeholders
      : placeholdersForPage(opts.placeholders, opts.pageIndex);
  const { under, over } = splitByLayer(forPage);

  // Placeholder geometry is measured from the trim's top-left corner, so shift
  // the drawing origin by whatever bleed the page image carries.
  const withOrigin = (draw: () => void) => {
    ctx.save();
    ctx.translate(offsetXPx, offsetYPx);
    draw();
    ctx.restore();
  };

  withOrigin(() => {
    for (const p of under) drawPlaceholder(ctx, p, opts, pxPerMm);
  });

  if (opts.pageImage) {
    ctx.drawImage(opts.pageImage, 0, 0, pageWidthPx, pageHeightPx);
  }

  withOrigin(() => {
    for (const p of over) drawPlaceholder(ctx, p, opts, pxPerMm);
    if (opts.showBoxes) {
      for (const p of [...under, ...over]) outlineBox(ctx, p, opts, pxPerMm);
    }
  });

  if (opts.showTrimLine && (offsetXPx > 0.5 || offsetYPx > 0.5)) {
    const trimWpx = trimWidthMm * pxPerMm;
    const trimHpx = (opts.trimHeightMm ?? 0) * pxPerMm ||
      pageHeightPx - offsetYPx * 2;
    ctx.save();
    // Dim the bleed margin so it reads as "this gets cut off".
    ctx.fillStyle = "rgba(15,23,42,0.18)";
    ctx.beginPath();
    ctx.rect(0, 0, pageWidthPx, pageHeightPx);
    ctx.rect(offsetXPx, offsetYPx, trimWpx, trimHpx);
    ctx.fill("evenodd");
    ctx.setLineDash([Math.max(4, pxPerMm * 2), Math.max(3, pxPerMm * 1.5)]);
    ctx.lineWidth = Math.max(1, pxPerMm * 0.3);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeRect(offsetXPx, offsetYPx, trimWpx, trimHpx);
    ctx.lineDashOffset = Math.max(4, pxPerMm * 2);
    ctx.strokeStyle = "rgba(15,23,42,0.85)";
    ctx.strokeRect(offsetXPx, offsetYPx, trimWpx, trimHpx);
    ctx.restore();
  }

}

