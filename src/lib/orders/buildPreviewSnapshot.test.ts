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

  it("pads the booklet body to a multiple of 4 before the back cover", () => {
    const mk = (id: string, type: string, sort: number, start: number | null = null, end: number | null = null) => ({
      id,
      document_id: `${id}-doc`,
      section_type: type,
      page_range_start: start,
      page_range_end: end,
      is_color: true,
      is_duplex: true,
      label: type,
      color: null,
      sort_order: sort,
    });

    const snapshot = buildPreviewSnapshot({
      productType: "saddle_stitched",
      selectedOptions: {},
      productOptions: [],
      sections: [mk("body", "body", 0), mk("front", "front_cover", 1, 0, 1), mk("back", "back_cover", 2)],
      documents: [
        {
          id: "front-doc",
          file_name: "front.pdf",
          page_count: 4,
          page_width_mm: 210,
          page_height_mm: 297,
          thumbnail_urls: Array.from({ length: 4 }, (_, i) => `front-${i + 1}`),
        },
        {
          id: "body-doc",
          file_name: "body.pdf",
          page_count: 69,
          page_width_mm: 210,
          page_height_mm: 297,
          thumbnail_urls: Array.from({ length: 69 }, (_, i) => `body-${i + 1}`),
        },
        {
          id: "back-doc",
          file_name: "back.pdf",
          page_count: 2,
          page_width_mm: 210,
          page_height_mm: 297,
          thumbnail_urls: ["back-1", "back-2"],
        },
      ],
    });

    expect(snapshot.pageRoles).toHaveLength(76);
    // 2 cover faces + 69 body + 3 blanks = 74, then the back cover pair.
    expect(snapshot.pageRoles.slice(71, 76)).toEqual([
      "blank_back",
      "blank_back",
      "blank_back",
      "back_cover",
      "back_cover",
    ]);
    expect(snapshot.thumbnails.slice(74)).toEqual(["back-1", "back-2"]);
  });


  it("persists per-page PDF source paths for high-resolution saved previews", () => {
    const snapshot = buildPreviewSnapshot({
      productType: "business_cards",
      selectedOptions: {},
      productOptions: [],
      scaleMode: "fit",
      sections: [
        {
          id: "body-section",
          document_id: "card-doc",
          section_type: "body",
          page_range_start: null,
          page_range_end: null,
          is_color: true,
          is_duplex: true,
          label: "Body",
          color: null,
          sort_order: 0,
        },
      ],
      documents: [
        {
          id: "card-doc",
          file_name: "card.pdf",
          file_path: "uploads/original-card.pdf",
          page_count: 2,
          page_width_mm: 90,
          page_height_mm: 50,
          preflight_data: {
            processed_file_path: "processed/card.pdf",
          },
          thumbnail_urls: ["thumb-1", "thumb-2"],
        },
      ],
    });

    expect(snapshot.thumbnails).toEqual(["thumb-1", "thumb-2"]);
    expect(snapshot.pdfSources).toEqual([
      { url: "processed/card.pdf", pageNumber: 1, cacheKey: "processed/card.pdf" },
      { url: "processed/card.pdf", pageNumber: 2, cacheKey: "processed/card.pdf" },
    ]);
    expect(snapshot.pdfSizeMm).toEqual({ widthMm: 90, heightMm: 50 });
    expect(snapshot.canvasSizeMm).toEqual({ widthMm: 90, heightMm: 50 });
    expect(snapshot.scaleMode).toBe("fit");
  });

  it("emits TrimBox clipping when MediaBox is larger than TrimBox, even if page dims match trim", () => {
    const snapshot = buildPreviewSnapshot({
      productType: "business_cards",
      selectedOptions: {},
      productOptions: [],
      sections: [
        {
          id: "body-section",
          document_id: "card-doc",
          section_type: "body",
          page_range_start: null,
          page_range_end: null,
          is_color: true,
          is_duplex: false,
          label: "Body",
          color: null,
          sort_order: 0,
        },
      ],
      documents: [
        {
          id: "card-doc",
          file_name: "card.pdf",
          file_path: "processed/card.pdf",
          page_count: 1,
          page_width_mm: 90,
          page_height_mm: 50,
          preflight_data: {
            boxes: {
              MediaBox: [0, 0, 283.4646, 170.0787],
              TrimBox: [14.1732, 14.1732, 269.2914, 155.9055],
            },
          },
          thumbnail_urls: ["thumb-1"],
        },
      ],
    });

    expect(snapshot.trimCrop).toBeDefined();
    expect(snapshot.trimCrop!.width).toBeCloseTo(0.9, 2);
    expect(snapshot.trimCrop!.height).toBeCloseTo(0.833, 2);
  });
});