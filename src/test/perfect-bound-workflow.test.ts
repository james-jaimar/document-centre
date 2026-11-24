import { describe, it, expect } from "vitest";
import { isPerfectBoundFamily, sectionPageCount, bodySpine, coverValidation, DEFAULT_COVER } from "@/lib/perfectBinding/workflow";
import { calculateSpine } from "@/lib/perfectBinding/spine";

describe("perfect-bound workflow", () => {
  it("recognises perf-bound and explicit admin/binding settings, not unrelated slugs", () => {
    expect(isPerfectBoundFamily({ slug: "perf-bound" })).toBe(true);
    expect(isPerfectBoundFamily({ slug: "perfect_bound" })).toBe(true);
    expect(isPerfectBoundFamily({ slug: "annuals", printing_rules: { binding_method: "perfect" } })).toBe(true);
    expect(isPerfectBoundFamily({ slug: "documents" }, "perfect")).toBe(true);
    expect(isPerfectBoundFamily({ slug: "performance-posters" })).toBe(false);
  });
  it("counts the assigned body range without removing any inner pages for covers", () => {
    const docs = [{ id: "text", page_count: 80 }];
    expect(sectionPageCount({ document_id: "text", section_type: "body", page_range_start: 2, page_range_end: 77 }, docs)).toBe(76);
    expect(bodySpine([{ document_id: "text", section_type: "body", is_duplex: true }], docs, 80).sheets).toBe(40);
  });
  it("counts mixed simplex/duplex sections on their own sheets", () => {
    expect(bodySpine([{ document_id: "a", section_type: "body", is_duplex: true }, { document_id: "b", section_type: "body", is_duplex: false }], [{ id: "a", page_count: 41 }, { id: "b", page_count: 10 }], 80).sheets).toBe(31);
  });
  it("requires front and back and rejects a wrap sized for an outdated spine", () => {
    const trim = { widthMm: 148, heightMm: 210 }, spine = calculateSpine({ pages: 80, duplex: true, gsm: 80 });
    const cover = { ...DEFAULT_COVER, trim, spine, front: { document_id: "a", page: 0 } };
    expect(coverValidation(cover, [], trim, spine)).toBe("Choose both front and back covers.");
    expect(coverValidation({ ...cover, mode: "wrap", wrap: { document_id: "a", page: 0 } }, [{ id: "a", page_count: 1, page_width_mm: 312, page_height_mm: 216 }], trim, spine)).toContain("Cover PDF must be");
  });
});