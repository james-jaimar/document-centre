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