import type { CanvasSize, PdfSource, TrimCrop } from "@/components/preview/previewTypes";

export interface PreviewSourceDocument {
  id?: string | null;
  order_item_id?: string | null;
  file_path?: string | null;
  page_count?: number | null;
  page_width_mm?: number | null;
  page_height_mm?: number | null;
  preflight_data?: unknown;
  thumbnail_urls?: unknown;
  sort_order?: number | null;
}

export interface PreviewFallback {
  thumbnails: string[];
  pdfSources: PdfSource[];
  pdfSizeMm?: { widthMm: number; heightMm: number };
  canvasSizeMm?: CanvasSize;
  pageAspectRatio?: number;
  trimCrop?: TrimCrop;
}

const PT_TO_MM = 25.4 / 72;

const asPreflight = (doc: PreviewSourceDocument): Record<string, any> =>
  (doc.preflight_data as Record<string, any> | null) ?? {};

const processedPathFor = (doc: PreviewSourceDocument) => {
  const processed = asPreflight(doc).processed_file_path as string | undefined;
  return processed || doc.file_path || null;
};

const getTrimBox = (doc: PreviewSourceDocument): number[] | undefined => {
  const preflight = asPreflight(doc);
  const trimBox = preflight.trim_box_pt as number[] | undefined;
  if (trimBox?.length === 4) return trimBox;
  const boxes = preflight.boxes as Record<string, number[]> | undefined;
  const boxed = boxes?.TrimBox ?? boxes?.CropBox;
  return boxed?.length === 4 ? boxed : undefined;
};

const trimSizeMm = (trimBox: number[]) => ({
  widthMm: Math.abs(trimBox[2] - trimBox[0]) * PT_TO_MM,
  heightMm: Math.abs(trimBox[3] - trimBox[1]) * PT_TO_MM,
});

const getPdfSizeMm = (doc: PreviewSourceDocument) => {
  const trimBox = getTrimBox(doc);
  if (trimBox) {
    const size = trimSizeMm(trimBox);
    if (size.widthMm > 0 && size.heightMm > 0) return size;
  }
  const widthMm = Number(doc.page_width_mm ?? 0);
  const heightMm = Number(doc.page_height_mm ?? 0);
  return widthMm > 0 && heightMm > 0 ? { widthMm, heightMm } : undefined;
};

const getTrimCrop = (doc: PreviewSourceDocument): TrimCrop | undefined => {
  const trimBox = getTrimBox(doc);
  if (!trimBox) return undefined;
  const boxes = asPreflight(doc).boxes as Record<string, number[]> | undefined;
  const mediaBox = boxes?.MediaBox;
  if (!mediaBox || mediaBox.length !== 4) return undefined;

  const mediaWmm = Math.abs(mediaBox[2] - mediaBox[0]) * PT_TO_MM;
  const mediaHmm = Math.abs(mediaBox[3] - mediaBox[1]) * PT_TO_MM;
  if (!mediaWmm || !mediaHmm) return undefined;

  const { widthMm: trimW, heightMm: trimH } = trimSizeMm(trimBox);
  if (mediaWmm - trimW < 1 && mediaHmm - trimH < 1) return undefined;

  const pageW = Number(doc.page_width_mm ?? 0);
  const pageH = Number(doc.page_height_mm ?? 0);
  if (pageW > 0 && pageH > 0) {
    const distTrim = Math.abs(pageW - trimW) + Math.abs(pageH - trimH);
    const distMedia = Math.abs(pageW - mediaWmm) + Math.abs(pageH - mediaHmm);
    if (distTrim < 2 && distMedia - distTrim > 2) return undefined;
  }

  const left = (Math.min(trimBox[0], trimBox[2]) * PT_TO_MM) / mediaWmm;
  const top = 1 - (Math.max(trimBox[1], trimBox[3]) * PT_TO_MM) / mediaHmm;
  return { left, top, width: trimW / mediaWmm, height: trimH / mediaHmm };
};

export function sourceDocumentsForJob(job: any, sourceDocuments: PreviewSourceDocument[] = []) {
  const sourceOrderItemId = job?.configuration?.source_order_item_id as string | undefined;
  if (!sourceOrderItemId) return [];
  return sourceDocuments
    .filter((doc) => doc.order_item_id === sourceOrderItemId)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

export function buildPreviewFallback(sourceDocuments: PreviewSourceDocument[] = []): PreviewFallback {
  const thumbnails: string[] = [];
  const pdfSources: PdfSource[] = [];

  sourceDocuments.forEach((doc) => {
    const pageCount = Math.max(0, Number(doc.page_count ?? 0));
    const thumbs = Array.isArray(doc.thumbnail_urls) ? (doc.thumbnail_urls as string[]) : [];
    thumbnails.push(...thumbs);

    const path = processedPathFor(doc);
    if (!path || pageCount <= 0) return;
    for (let page = 1; page <= pageCount; page += 1) {
      pdfSources.push({ url: path, pageNumber: page, cacheKey: path });
    }
  });

  const firstDoc = sourceDocuments[0];
  const pdfSizeMm = firstDoc ? getPdfSizeMm(firstDoc) : undefined;
  return {
    thumbnails,
    pdfSources,
    pdfSizeMm,
    canvasSizeMm: pdfSizeMm,
    pageAspectRatio: pdfSizeMm ? pdfSizeMm.widthMm / pdfSizeMm.heightMm : undefined,
    trimCrop: firstDoc ? getTrimCrop(firstDoc) : undefined,
  };
}