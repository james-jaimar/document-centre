import { PDFDocument, PDFName, PDFArray } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { uploadToS3, getDownloadUrls } from "@/lib/s3Storage";

/**
 * pdf-lib's copyPages() only carries MediaBox across. We need TrimBox /
 * BleedBox / CropBox / ArtBox preserved so downstream rendering and
 * imposition can crop out the customer's crop marks. Read the raw box
 * entries off the source page dict and copy them verbatim to the dest
 * page dict — only when actually declared, so we don't promote MediaBox
 * to TrimBox and mislead the explicit-trim detection.
 */
const BOX_KEYS = ["TrimBox", "BleedBox", "CropBox", "ArtBox"] as const;
function copyPageBoxes(sourcePage: any, destPage: any) {
  const srcNode = sourcePage.node;
  const dstNode = destPage.node;
  for (const key of BOX_KEYS) {
    const name = PDFName.of(key);
    const entry = srcNode.get(name);
    if (entry instanceof PDFArray) {
      dstNode.set(name, entry.clone());
    }
  }
}

/**
 * Download a PDF from S3, keep only the first `keepPages` pages, then
 * overwrite the same `file_path` with the trimmed file. The document row's
 * page_count is updated and `document_status` is set back to "processing"
 * so the caller can trigger reprocessDocument() to refresh thumbnails.
 *
 * Returns the new byte size of the trimmed PDF.
 */
export async function trimDocumentToFirstPages(
  docId: string,
  filePath: string,
  fileName: string,
  keepPages: number,
): Promise<number> {
  // 1. Pull the existing PDF down via signed URL.
  if (!filePath) throw new Error("Document has no file path — it may still be uploading");
  const urls = await getDownloadUrls([filePath]);
  const url = urls[filePath];
  if (!url) throw new Error("Could not generate download URL for the PDF");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch PDF (${resp.status})`);
  const sourceBytes = new Uint8Array(await resp.arrayBuffer());

  // 2. Trim with pdf-lib.
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const total = sourcePdf.getPageCount();
  const take = Math.min(keepPages, total);
  if (take >= total) {
    // Nothing to trim — early-out.
    return sourceBytes.byteLength;
  }
  const out = await PDFDocument.create();
  const indices = Array.from({ length: take }, (_, i) => i);
  const copied = await out.copyPages(sourcePdf, indices);
  for (let i = 0; i < copied.length; i++) {
    copyPageBoxes(sourcePdf.getPage(indices[i]), copied[i]);
    out.addPage(copied[i]);
  }
  const outBytes = await out.save();

  // 3. Overwrite the same S3 key.
  const blob = new Blob([outBytes as BlobPart], { type: "application/pdf" });
  await uploadToS3(filePath, blob);

  // 4. Reset the document row so the standard pipeline re-inspects + re-renders.
  const { data: existing } = await supabase
    .from("documents")
    .select("preflight_data, backend_asset_id")
    .eq("id", docId)
    .single();
  const prevPreflight = (existing?.preflight_data as Record<string, any> | null) ?? {};

  await supabase
    .from("documents")
    .update({
      file_size: outBytes.byteLength,
      page_count: take,
      document_status: "processing",
      // Force a fresh inspect — the asset on the backend is now stale.
      backend_asset_id: null,
      thumbnail_urls: [],
      preflight_data: {
        ...prevPreflight,
        print_ready_done: false,
        trimmed_to_pages: take,
      },
    })
    .eq("id", docId);

  return outBytes.byteLength;
}
