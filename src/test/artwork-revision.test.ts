import { describe, expect, it } from "vitest";
import { canReviseArtwork, isJobRevisable, replaceArtworkPath } from "../../supabase/functions/order-engine/artwork-revision-rules";

describe("placed artwork revisions", () => {
  it("permits customers during initial order review", () => {
    expect(canReviseArtwork({ admin_status: "under_review" }, { job_status: "new_job" }, false)).toBe(true);
  });
  it("blocks customers after approval", () => {
    expect(canReviseArtwork({ admin_status: "approved" }, { job_status: "proof_approved" }, false)).toBe(false);
  });
  it("allows staff to replace artwork while the job is still in production", () => {
    expect(canReviseArtwork({ admin_status: "approved" }, { job_status: "in_production" }, true)).toBe(true);
    expect(canReviseArtwork({ admin_status: "in_production" }, { job_status: "in_production" }, true)).toBe(true);
    expect(canReviseArtwork({ admin_status: "in_production" }, { job_status: "awaiting_proof" }, true)).toBe(true);
  });
  it("blocks artwork changes once the job goes to print", () => {
    expect(canReviseArtwork({ admin_status: "in_production" }, { job_status: "sent_to_print" }, true)).toBe(false);
    expect(canReviseArtwork({ admin_status: "sent_to_print" }, { job_status: "in_production" }, true)).toBe(false);
    expect(canReviseArtwork({ admin_status: "in_production" }, { job_status: "completed" }, true)).toBe(false);
  });
  it("filters which jobs expose the update control", () => {
    expect(isJobRevisable({ job_status: "in_production" }, true)).toBe(true);
    expect(isJobRevisable({ job_status: "sent_to_print" }, true)).toBe(false);
    expect(isJobRevisable({ job_status: "in_production" }, false)).toBe(false);
  });
  it("retains prices and unrelated files while replacing all active artwork references", () => {
    const original = { price: 13901.95, templated_artwork: { placeholders: [{ storage_path: "old.pdf", thumbnail_path: "old.jpg" }] },
      raw_spec: { uploaded_artwork: { storage_path: "old.pdf" } }, source_assets: [{ storage_path: "other.pdf" }] };
    const next = replaceArtworkPath(original, "old.pdf", { storage_path: "new.pdf", file_name: "new.pdf", file_size_bytes: 100 });
    expect(next.templated_artwork.placeholders[0].storage_path).toBe("new.pdf");
    expect(next.raw_spec.uploaded_artwork.storage_path).toBe("new.pdf");
    expect(next.templated_artwork.placeholders[0].thumbnail_path).toBeUndefined();
    expect(next.source_assets[0].storage_path).toBe("other.pdf");
    expect(next.price).toBe(13901.95);
    expect(original.templated_artwork.placeholders[0].storage_path).toBe("old.pdf");
  });
});