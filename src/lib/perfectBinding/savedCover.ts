import type { PerfectBoundCover } from "./workflow";

export function savedPerfectCover(snapshot: { spec: { perfect_bound_cover?: PerfectBoundCover }; documents?: { id?: string; thumbnail_urls?: string[] }[] }) {
  const cover = snapshot.spec.perfect_bound_cover;
  if (!cover) return null;
  const source = cover.mode === "wrap" ? cover.wrap : cover.front;
  const doc = snapshot.documents?.find((d) => d.id === source?.document_id);
  const path = source ? doc?.thumbnail_urls?.[source.page] : undefined;
  if (!path) return null;
  // Crop a designer wrap to its front panel without altering the saved PDF.
  const fullW = cover.trim.widthMm * 2 + cover.spine.spineMm + 2 * cover.bleed_mm;
  const fullH = cover.trim.heightMm + 2 * cover.bleed_mm;
  return { path, wrap: cover.mode === "wrap", widthScale: fullW / cover.trim.widthMm, heightScale: fullH / cover.trim.heightMm, rightOffset: cover.bleed_mm / cover.trim.widthMm, topOffset: cover.bleed_mm / cover.trim.heightMm };
}