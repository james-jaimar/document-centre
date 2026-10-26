import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/downloadFile", () => ({
  downloadObject: vi.fn(),
  buildFilename: (parts: (string | null | undefined)[], ext: string) => `${parts.filter(Boolean).join("-")}.${ext}`,
}));

import { buildCustomerFiles, customerFileDownloadName } from "./CustomerFilesCard";

describe("customer template uploads", () => {
  const placeholders = [
    { kind: "image", document_id: "header", file_name: "header.jpg", storage_path: "copies/header.jpg", file_size: 5124238 },
    { kind: "image", document_id: "watermark", file_name: "watermark.png", storage_path: "copies/watermark.png", preserve_original_density: true },
    { kind: "text", value: "Company" },
  ];

  it("includes both original template uploads only once across mirrored snapshots", () => {
    const files = buildCustomerFiles([], [], { templated_artwork: { placeholders }, raw_spec: { templated_artwork: { placeholders } } });
    expect(files.map((file) => file.path)).toEqual(["copies/header.jpg", "copies/watermark.png"]);
    expect(files[0]).toMatchObject({ key: "header", name: "header.jpg", sizeBytes: 5124238 });
  });

  it("reads raw-spec-only templates and deduplicates against document rows", () => {
    const files = buildCustomerFiles([], [{ storage_path: "copies/header.jpg", file_name: "header.jpg" }], { raw_spec: { templated_artwork: { placeholders } } });
    expect(files).toHaveLength(2);
    expect(files[1].path).toBe("copies/watermark.png");
  });

  it.each(["jpg", "png", "pdf"])("preserves the original %s extension in downloads", (extension) => {
    expect(customerFileDownloadName({ key: "x", path: `copies/art.${extension}`, name: `art.${extension}` }, "CAL-26019", "1")).toBe(`CAL-26019-1-art.${extension}`);
  });

  it("uses the storage extension when the file name has no extension", () => {
    expect(customerFileDownloadName({ key: "x", path: "copies/art.png", name: "Artwork" })).toBe("Artwork.png");
  });
});