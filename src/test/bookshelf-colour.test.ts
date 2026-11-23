import { describe, it, expect } from "vitest";
import { bookshelfCoverIsMono } from "@/lib/bookshelfColour";

describe("bookshelfCoverIsMono", () => {
  it("honours a black & white cover section", () => {
    expect(bookshelfCoverIsMono({ sections: [{ section_type: "body", is_color: true }, { section_type: "front_cover", is_color: false }] })).toBe(true);
  });
  it("keeps a colour cover in colour", () => {
    expect(bookshelfCoverIsMono({ sections: [{ section_type: "front_cover", is_color: true }] })).toBe(false);
  });
  it("falls back to the saved Print Colour option", () => {
    expect(bookshelfCoverIsMono({ spec: { selected_options: { "Print Colour": "Black & White" } } })).toBe(true);
    expect(bookshelfCoverIsMono({ spec: { selected_options: { "Print Colour": "Full Colour" } } })).toBe(false);
  });
});
