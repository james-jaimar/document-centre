import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canReviseArtwork, replaceArtworkPath } from "./artwork-revision-rules.ts";
import { artworkRevision } from "./artwork-revision.ts";

Deno.test("artwork revision denies production and permits initial customer review", () => {
  assertEquals(canReviseArtwork({ admin_status: "under_review" }, { job_status: "new_job" }, false), true);
  assertEquals(canReviseArtwork({ admin_status: "approved" }, { job_status: "in_production" }, true), false);
  assertEquals(typeof artworkRevision, "function");
});
Deno.test("artwork remap retains immutable price and original object", () => {
  const saved = { price: 13901.95, uploaded_artwork: { storage_path: "old.pdf" } };
  const result = replaceArtworkPath(saved, "old.pdf", { storage_path: "new.pdf", file_name: "new.pdf", file_size_bytes: 100 });
  assertEquals(result.price, 13901.95);
  assertEquals(result.uploaded_artwork.storage_path, "new.pdf");
  assertEquals(saved.uploaded_artwork.storage_path, "old.pdf");
});