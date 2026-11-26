export function bookshelfEnabled(value: unknown): boolean {
  return value === true;
}

export function assertBookshelfActor(actor: { is_anonymous?: boolean }, enabled: unknown, membership: boolean) {
  if (actor.is_anonymous) throw new Error("Sign in to use your bookshelf");
  if (!bookshelfEnabled(enabled)) throw new Error("Bookshelf is not enabled for this tenant");
  if (!membership) throw new Error("No active membership for this tenant");
}

export function assertBookshelfQuantity(quantity: unknown): asserts quantity is number {
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error("Enter a whole number of copies greater than zero");
  }
}

export function assertBookshelfPdf(snapshot: any) {
  if (!snapshot.documents?.length || !snapshot.sections?.length || !(snapshot.spec?.page_count > 0)) {
    throw new Error("Upload and assign a PDF before saving");
  }
  if (snapshot.spec?.photo_prints || snapshot.spec?.canvas_prints || snapshot.spec?.templated_artwork || snapshot.spec?.uploaded_artwork) {
    throw new Error("The bookshelf currently supports configured PDF documents");
  }
  if (snapshot.documents.some((d: any) => d.mime_type !== "application/pdf" || !["analyzed", "ready"].includes(d.document_status) || !d.file_path)) {
    throw new Error("Wait for all PDF checks to finish before saving");
  }
}

/** Independent document copies also remap section anchors; no deletable originals are shared. */
export async function copyBookshelfSnapshot(snapshot: any, prefix: string, copy: (from: string, to: string) => Promise<void>, uuid: () => string = () => crypto.randomUUID()) {
  const documents = [];
  const ids = new Map<string, string>();
  for (const doc of snapshot.documents) {
    const id = uuid();
    const path = `${prefix}/${id}.pdf`;
    await copy(doc.file_path, path);
    ids.set(doc.id, id);
    const thumbnails: string[] = [];
    for (const [index, thumbnail] of (doc.thumbnail_urls ?? []).entries()) {
      if (!thumbnail) { thumbnails.push(""); continue; }
      if (typeof thumbnail !== "string") throw new Error("Invalid PDF thumbnail");
      const clean = thumbnail.split("?")[0];
      const extension = clean.match(/\.(png|jpe?g|webp)$/i)?.[1] ?? "png";
      const thumbnailPath = `${prefix}/${id}-page-${index}.${extension}`;
      await copy(thumbnail, thumbnailPath);
      thumbnails.push(thumbnailPath);
    }
    documents.push({ ...doc, id, file_path: path, thumbnail_urls: thumbnails, backend_asset_id: null });
  }
  const sections = snapshot.sections.map((s: any) => {
    const documentId = s.document_id ? ids.get(s.document_id) : null;
    if (s.document_id && !documentId) throw new Error("A document section references missing artwork");
    return { ...s, document_id: documentId };
  });
  const spec = { ...snapshot.spec };
  if (spec.perfect_bound_cover) {
    const cover = { ...spec.perfect_bound_cover };
    for (const side of ["front", "back", "wrap"]) {
      if (!cover[side]) continue;
      const id = ids.get(cover[side].document_id);
      if (!id) throw new Error("A cover references missing artwork");
      cover[side] = { ...cover[side], document_id: id };
    }
    spec.perfect_bound_cover = cover;
  }
  return { ...snapshot, spec, documents, sections };
}
type FrozenAsset = { id: string; original_filename?: string | null; source_storage_path?: string | null; normalized_storage_path?: string | null; page_count?: number | null; width_pt?: number | null; height_pt?: number | null; boxes?: Record<string, number[]> | null };
type FrozenDerived = { asset_id: string; kind: string; page: number | null; storage_path: string };

/** Rebuild an editable bookshelf snapshot from a placed job's frozen production assets (the cart draft may already be gone). */
export function placedJobBookshelfSnapshot(job: any, assets: FrozenAsset[], derived: FrozenDerived[], uuid: () => string = () => crypto.randomUUID()) {
  const config = job?.configuration ?? {};
  const raw = config.raw_spec ?? {};
  const frozenCover = config.perfect_bound_cover;
  const byAsset = new Map(assets.map((a) => [a.id, a]));
  const docIds = new Map<string, string>();
  const documents: any[] = [];
  const mm = 25.4 / 72;
  const addDoc = (assetId: string | null | undefined, fileName?: string | null) => {
    if (!assetId) return null;
    if (docIds.has(assetId)) return docIds.get(assetId)!;
    const asset = byAsset.get(assetId);
    const path = asset?.normalized_storage_path || asset?.source_storage_path;
    if (!asset || !path) throw new Error("This order's print files are no longer available");
    const pages = Number(asset.page_count ?? 0);
    const pick = (kind: string) => new Map(derived.filter((d) => d.asset_id === assetId && d.kind === kind && d.page != null).map((d) => [d.page as number, d.storage_path]));
    const thumbs = pick("thumbnail_page"), previews = pick("preview_page");
    const box = asset.boxes?.TrimBox ?? asset.boxes?.CropBox ?? asset.boxes?.MediaBox;
    const id = uuid();
    docIds.set(assetId, id);
    documents.push({
      id, file_name: fileName || asset.original_filename || "document.pdf", file_path: path, mime_type: "application/pdf", document_status: "ready",
      page_count: pages, sort_order: documents.length,
      page_width_mm: box ? Math.abs(box[2] - box[0]) * mm : null, page_height_mm: box ? Math.abs(box[3] - box[1]) * mm : null,
      preflight_data: { boxes: asset.boxes ?? null }, thumbnail_urls: Array.from({ length: pages }, (_, i) => thumbs.get(i + 1) ?? previews.get(i + 1) ?? ""),
    });
    return id;
  };
  const sections = (config.merge_directives ?? []).filter((d: any) => d?.asset_id).map((d: any, i: number) => ({
    document_id: addDoc(d.asset_id, d.file_name), section_type: d.section_type ?? "body", page_range_start: d.page_range_start ?? null, page_range_end: d.page_range_end ?? null,
    paper_stock: d.paper_stock ?? null, paper_weight_gsm: d.paper_weight_gsm ?? null, is_color: d.is_color ?? null, is_duplex: d.is_duplex ?? null, sort_order: i,
  }));
  const spec = { ...raw };
  if (raw.perfect_bound_cover) {
    const cover = { ...raw.perfect_bound_cover };
    for (const side of ["front", "back", "wrap"]) {
      if (!cover[side]) continue;
      const id = addDoc(frozenCover?.[side]?.asset_id);
      if (!id) throw new Error("This order's cover file is no longer available");
      cover[side] = { ...cover[side], document_id: id };
    }
    spec.perfect_bound_cover = cover;
  }
  const family = job?.product_snapshot?.product_family ?? {};
  return { product_family_id: family.id, product_name: family.name ?? job?.product_name ?? "Document", spec, documents, sections };
}
