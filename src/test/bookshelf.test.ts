import { describe, expect, it, vi } from "vitest";
import { assertBookshelfActor, assertBookshelfPdf, assertBookshelfQuantity, bookshelfEnabled, copyBookshelfSnapshot } from "../../supabase/functions/order-engine/bookshelf-rules";
import { parseTenantPath } from "@/lib/tenantUrl";

describe("Tenant opt-in bookshelf", () => {
  it("keeps bookshelf links within the tenant instead of treating them as branch names", () => {
    expect(parseTenantPath("/t/demo/bookshelf")).toEqual({ slug: "demo", branchSlug: null });
    expect(parseTenantPath("/t/demo/joburg/bookshelf")).toEqual({ slug: "demo", branchSlug: "joburg" });
  });
  it("stays disabled without an explicit tenant opt-in", () => {
    for (const value of [undefined, null, false, "true", { enabled: true }]) expect(bookshelfEnabled(value)).toBe(false);
    expect(bookshelfEnabled(true)).toBe(true);
  });
  it("refuses guests even in an enabled tenant", () => {
    expect(() => assertBookshelfActor({ is_anonymous: true }, true, true)).toThrow("Sign in");
  });
  it("refuses a signed-in customer without membership in the selected tenant", () => {
    expect(() => assertBookshelfActor({}, true, false)).toThrow("membership");
  });
  it("refuses saves and orders after a tenant switches the feature off", () => {
    expect(() => assertBookshelfActor({}, false, true)).toThrow("not enabled");
  });
  it("accepts only positive whole copy quantities", () => {
    for (const q of [0, -1, 1.5, NaN, "15"]) expect(() => assertBookshelfQuantity(q)).toThrow();
    expect(() => assertBookshelfQuantity(15)).not.toThrow();
  });
});

const snapshot = {
  spec: { page_count: 40, selected_options: { Binding: "wire", Paper: "80gsm" } },
  documents: [{ id: "original", file_path: "cart/original.pdf", mime_type: "application/pdf", document_status: "ready" }],
  sections: [{ document_id: "original", section_type: "body", is_duplex: true }],
};
describe("Bookshelf retains configured PDFs", () => {
  it("copies later cover PDFs and remaps the saved cover selections", async () => {
    const coverSnapshot = { ...snapshot, spec: { ...snapshot.spec, perfect_bound_cover: { mode: "guided", front: { document_id: "cover", page: 0 }, back: { document_id: "cover", page: 1 } } }, documents: [...snapshot.documents, { ...snapshot.documents[0], id: "cover", file_path: "cart/cover.pdf" }] };
    let i = 0;
    const result = await copyBookshelfSnapshot(coverSnapshot, "shelf", vi.fn().mockResolvedValue(undefined), () => `copy-${++i}`);
    expect(result.spec.perfect_bound_cover.front.document_id).toBe("copy-2");
    expect(result.spec.perfect_bound_cover.back).toEqual({ document_id: "copy-2", page: 1 });
    expect(coverSnapshot.spec.perfect_bound_cover.front.document_id).toBe("cover");
  });
  it("copies artwork and remaps anchors without altering the print settings or original", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const result = await copyBookshelfSnapshot(snapshot, "shelf/version", copy, () => "copied");
    expect(copy).toHaveBeenCalledWith("cart/original.pdf", "shelf/version/copied.pdf");
    expect(result.sections[0].document_id).toBe("copied");
    expect(result.spec.selected_options).toEqual({ Binding: "wire", Paper: "80gsm" });
    expect(snapshot.documents[0].file_path).toBe("cart/original.pdf");
  });
  it("never falls back to a deletable original after a failed copy", async () => {
    await expect(copyBookshelfSnapshot(snapshot, "shelf", async () => { throw new Error("copy failed"); })).rejects.toThrow("copy failed");
  });
  it("copies a 60-page body PDF and only its first thumbnail, not all 60 pages", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const source = { ...snapshot, documents: [{ ...snapshot.documents[0], page_count: 60, thumbnail_urls: Array.from({ length: 60 }, (_, page) => `cart/body-${page}.png`) }] };
    const result = await copyBookshelfSnapshot(source, "shelf", copy, () => "body");
    expect(copy.mock.calls).toEqual([["cart/original.pdf", "shelf/body.pdf"], ["cart/body-0.png", "shelf/body-page-0.png"]]);
    expect(result.documents[0].page_count).toBe(60);
    expect(result.documents[0].thumbnail_urls).toEqual(["shelf/body-page-0.png", ...Array(59).fill("")]);
    expect(source.documents[0].thumbnail_urls[59]).toBe("cart/body-59.png");
  });
  it("keeps selected front, back and wrap thumbnails at their original page indices", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const source = {
      ...snapshot,
      spec: { ...snapshot.spec, perfect_bound_cover: { front: { document_id: "original", page: 2 }, back: { document_id: "original", page: 4 }, wrap: { document_id: "original", page: 2 } } },
      documents: [{ ...snapshot.documents[0], thumbnail_urls: Array.from({ length: 6 }, (_, page) => `cart/cover-${page}.png`) }],
    };
    const result = await copyBookshelfSnapshot(source, "shelf", copy, () => "cover");
    expect(copy.mock.calls).toEqual([
      ["cart/original.pdf", "shelf/cover.pdf"],
      ["cart/cover-0.png", "shelf/cover-page-0.png"],
      ["cart/cover-2.png", "shelf/cover-page-2.png"],
      ["cart/cover-4.png", "shelf/cover-page-4.png"],
    ]);
    expect(result.documents[0].thumbnail_urls).toEqual(["shelf/cover-page-0.png", "", "shelf/cover-page-2.png", "", "shelf/cover-page-4.png", ""]);
    expect(result.spec.perfect_bound_cover.back).toEqual({ document_id: "cover", page: 4 });
  });
  it("keeps independent cover thumbnails after the source draft is removed", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const result = await copyBookshelfSnapshot({ ...snapshot, documents: [{ ...snapshot.documents[0], thumbnail_urls: ["cart/cover.png"], backend_asset_id: "old-asset" }] }, "shelf", copy, () => "copy");
    expect(result.documents[0].thumbnail_urls).toEqual(["shelf/copy-page-0.png"]);
    expect(copy).toHaveBeenCalledWith("cart/cover.png", "shelf/copy-page-0.png");
    expect(result.documents[0].backend_asset_id).toBeNull();
  });
  it("waits for PDF checks and rejects non-PDF artwork", () => {
    expect(() => assertBookshelfPdf(snapshot)).not.toThrow();
    expect(() => assertBookshelfPdf({ ...snapshot, documents: [{ ...snapshot.documents[0], document_status: "processing" }] })).toThrow("checks");
    expect(() => assertBookshelfPdf({ ...snapshot, documents: [{ ...snapshot.documents[0], mime_type: "image/png" }] })).toThrow("checks");
  });
});
import { placedJobBookshelfSnapshot } from "../../supabase/functions/order-engine/bookshelf-rules";
describe("Saving a placed perfect-bound order to the bookshelf", () => {
  const job = {
    product_name: "Perfect Bound Books",
    product_snapshot: { product_family: { id: "fam", name: "Perfect Bound Books" } },
    configuration: {
      merge_directives: [{ asset_id: "body-a", file_name: "a.pdf", section_type: "body", is_color: true, is_duplex: false }, { asset_id: "body-b", file_name: "b.pdf", section_type: "body", is_color: true, is_duplex: false }],
      perfect_bound_cover: { front: { asset_id: "cover-a", document_id: "gone", page: 0 } },
      raw_spec: { page_count: 72, perfect_bound_cover: { mode: "guided", back_blank: "colour", back_colour: "#ff2e17", front: { document_id: "gone", page: 0, placement: { x: -0.3, y: 0.3, scale: 1 } } } },
    },
  };
  const assets = [
    { id: "body-a", normalized_storage_path: "prepared/a.pdf", page_count: 12, boxes: { MediaBox: [0, 0, 595.276, 841.89] } },
    { id: "body-b", source_storage_path: "uploads/b.pdf", page_count: 60 },
    { id: "cover-a", source_storage_path: "uploads/cover.pdf", normalized_storage_path: "resized/cover.pdf", page_count: 1 },
  ];
  it("rebuilds from frozen files after the cart draft is gone, keeping cover choices", () => {
    let i = 0;
    const snap = placedJobBookshelfSnapshot(job, assets, [{ asset_id: "body-a", kind: "thumbnail_page", page: 1, storage_path: "thumbs/a1.png" }], () => `doc-${++i}`);
    expect(snap.documents.map((d) => d.file_path)).toEqual(["prepared/a.pdf", "uploads/b.pdf", "uploads/cover.pdf"]);
    expect(snap.sections.map((s: any) => s.document_id)).toEqual(["doc-1", "doc-2"]);
    expect(snap.spec.perfect_bound_cover.front).toEqual({ document_id: "doc-3", page: 0, placement: { x: -0.3, y: 0.3, scale: 1 } });
    expect(snap.spec.perfect_bound_cover.back_colour).toBe("#ff2e17");
    expect(snap.documents[0].thumbnail_urls[0]).toBe("thumbs/a1.png");
    expect(() => assertBookshelfPdf(snap)).not.toThrow();
  });
  it("refuses to save when a frozen print file is missing", () => {
    expect(() => placedJobBookshelfSnapshot(job, assets.slice(0, 2), [])).toThrow("no longer available");
  });
});
