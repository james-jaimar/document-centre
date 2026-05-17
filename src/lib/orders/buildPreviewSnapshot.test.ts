import { describe, expect, it } from "vitest";
import { buildPreviewSnapshot } from "./buildPreviewSnapshot";

describe("buildPreviewSnapshot", () => {
  it("places simplex booklet cover blanks beside their cover sheets before padding", () => {
    const sections = [
      {
        id: "body-section",
        document_id: "body-doc",
        section_type: "body",
        page_range_start: null,
        page_range_end: null,
        is_color: true,
        is_duplex: true,
        label: "Body",
        color: null,
        sort_order: 0,
      },
      {
        id: "front-section",
        document_id: "front-doc",
        section_type: "front_cover",
        page_range_start: null,
        page_range_end: null,
        is_color: true,
        is_duplex: false,
        label: "Front Cover",
        color: null,
        sort_order: 1,
      },
      {
        id: "back-section",
        document_id: "back-doc",
        section_type: "back_cover",
        page_range_start: null,
        page_range_end: null,
        is_color: true,
        is_duplex: false,
        label: "Back Cover",
        color: null,
        sort_order: 2,
      },
    ];

    const documents = [
      {
        id: "front-doc",
        file_name: "front.pdf",
        page_count: 1,
        page_width_mm: 210,
        page_height_mm: 297,
        thumbnail_urls: ["front-1"],
      },
      {
        id: "body-doc",
        file_name: "body.pdf",
        page_count: 8,
        page_width_mm: 210,
        page_height_mm: 297,
        thumbnail_urls: Array.from({ length: 8 }, (_, i) => `body-${i + 1}`),
      },
      {
        id: "back-doc",
        file_name: "back.pdf",
        page_count: 1,
        page_width_mm: 210,
        page_height_mm: 297,
        thumbnail_urls: ["back-1"],
      },
    ];

    const snapshot = buildPreviewSnapshot({
      productType: "saddle_stitched",
      selectedOptions: {},
      productOptions: [],
      sections,
      documents,
    });

    expect(snapshot.pageRoles).toEqual([
      "front_cover",
      "blank_back",
      "body",
      "body",
      "body",
      "body",
      "body",
      "body",
      "body",
      "body",
      "blank_back",
      "back_cover",
    ]);
    expect(snapshot.thumbnails).toEqual([
      "front-1",
      "",
      "body-1",
      "body-2",
      "body-3",
      "body-4",
      "body-5",
      "body-6",
      "body-7",
      "body-8",
      "",
      "back-1",
    ]);
  });
});