import { describe, it, expect } from "vitest";
import { isPerfectBoundFamily, sectionPageCount, bodySpine, coverValidation, DEFAULT_COVER, perfectBoundProductionReady } from "@/lib/perfectBinding/workflow";
import { calculateSpine } from "@/lib/perfectBinding/spine";

describe("perfect-bound workflow", () => {
  it("keeps ordering off until the admin explicitly confirms production readiness", () => {
    expect(perfectBoundProductionReady(undefined)).toBe(false);
    expect(perfectBoundProductionReady({ perfect_bound_production_ready: "true" })).toBe(false);
    expect(perfectBoundProductionReady({ perfect_bound_production_ready: true })).toBe(true);
  });
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
    expect(coverValidation(cover, [], trim, spine)).toBe("Choose both front and back covers, or leave the back blank.");
    expect(coverValidation({ ...cover, mode: "wrap", wrap: { document_id: "a", page: 0 } }, [{ id: "a", page_count: 1, page_width_mm: 312, page_height_mm: 216 }], trim, spine)).toContain("Cover PDF must be");
  });
});
import { clampPlacement as cp, placementFrame as pf, spineTextSizeMm, coverValidation as cv } from "@/lib/perfectBinding/workflow";
import { calculateSpine as cs } from "@/lib/perfectBinding/spine";
describe("cover placement and blank back", () => {
  const trim = { widthMm: 148, heightMm: 210 };
  it("default frame fills trim plus 3 mm bleed, matching the print server", () => {
    expect(pf(trim, 3)).toEqual({ left: -3, top: -3, width: 154, height: 216 });
  });
  it("zoom keeps the artwork centred and offsets move it", () => {
    const f = pf(trim, 3, { x: 10, y: -5, scale: 2 });
    expect(f.left + f.width / 2).toBeCloseTo(84);
    expect(f.top + f.height / 2).toBeCloseTo(100);
  });
  it("zoom is limited to 30%–300%", () => {
    expect(cp({ scale: 9 }, trim, 3).scale).toBe(3);
    expect(cp({ scale: 0.01 }, trim, 3).scale).toBe(0.3);
  });
  it("spine text stays 1.5 mm clear of each fold", () => {
    expect(spineTextSizeMm(5)).toBeLessThanOrEqual(2);
  });
  it("a blank back cover only needs a front cover", () => {
    const spine = cs({ pages: 200, duplex: true, gsm: 80 });
    const doc = { id: "f", page_count: 1, page_width_mm: 148, page_height_mm: 210, document_status: "ready" };
    const base = { version: 1 as const, mode: "guided" as const, spine_colour: "#000000", text_colour: "#FFFFFF", title: "", author: "", bleed_mm: 3, trim, spine, front: { document_id: "f", page: 0 } };
    expect(cv({ ...base, back_blank: "white" }, [doc], trim, spine)).toBeNull();
    expect(cv(base, [doc], trim, spine)).toMatch(/back/);
  });
});
