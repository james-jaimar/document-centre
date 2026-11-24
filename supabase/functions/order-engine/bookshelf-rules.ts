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