import { describe, expect, it } from "vitest";
import { remapClonedArtwork } from "./remapClonedArtwork";

const documents = [
  { originalId: "header-doc", originalPath: "uploads/header.jpg", clonedId: "new-header", clonedPath: "order-items/edit/header.jpg" },
  { originalId: "watermark-doc", originalPath: "uploads/watermark.png", clonedId: "new-watermark", clonedPath: "order-items/edit/watermark.png" },
];

describe("cart-edit artwork references", () => {
  it("remaps all template placeholders while retaining original-density and layout values", () => {
    const spec = { templated_artwork: { template_id: "design-6", placeholders: [
      { kind: "image", document_id: "header-doc", storage_path: "uploads/header.jpg", offset_x: 12 },
      { kind: "image", document_id: "watermark-doc", storage_path: "uploads/watermark.png", preserve_original_density: true, opacity: 1 },
      { kind: "text", value: "Customer name" },
    ] } };
    const original = JSON.stringify(spec);
    expect(remapClonedArtwork(spec, documents).templated_artwork.placeholders).toEqual([
      { kind: "image", document_id: "new-header", storage_path: "order-items/edit/header.jpg", offset_x: 12 },
      { kind: "image", document_id: "new-watermark", storage_path: "order-items/edit/watermark.png", preserve_original_density: true, opacity: 1 },
      { kind: "text", value: "Customer name" },
    ]);
    expect(JSON.stringify(spec)).toBe(original);
  });

  it("remaps every photo print rather than just the first", () => {
    const spec = { photo_prints: { photos: documents.map((doc) => ({ storage_path: doc.originalPath, document_id: doc.originalId, quantity: 3 })) } };
    expect(remapClonedArtwork(spec, documents).photo_prints.photos).toEqual(documents.map((doc) => ({ storage_path: doc.clonedPath, document_id: doc.clonedId, quantity: 3 })));
  });

  it("remaps canvas print documents by ID even when their path is outdated", () => {
    const spec = { canvas_prints: { canvases: [{ document_id: "header-doc", storage_path: "stale/header.jpg", wrap_slug: "mirror" }] } };
    expect(remapClonedArtwork(spec, documents).canvas_prints.canvases[0]).toEqual({ document_id: "new-header", storage_path: "order-items/edit/header.jpg", wrap_slug: "mirror" });
  });

  it("retains the existing uploaded-artwork fix and matches by path without requiring an ID", () => {
    expect(remapClonedArtwork({ uploaded_artwork: { storage_path: "uploads/header.jpg" } }, documents)).toEqual({ uploaded_artwork: { storage_path: "order-items/edit/header.jpg" } });
  });

  it("leaves unrelated references and missing specs unchanged", () => {
    const spec = { metadata: { storage_path: "uploads/header.jpg" }, templated_artwork: { placeholders: [{ storage_path: "unrelated.jpg", document_id: "other" }] } };
    expect(remapClonedArtwork(spec, documents)).toEqual(spec);
    expect(remapClonedArtwork(null, documents)).toBeNull();
  });
});