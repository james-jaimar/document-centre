import { describe, expect, it } from "vitest";
import { frontPanelDrawRect, perfectCoverDocumentIds } from "@/lib/perfectBinding/workflow";

describe("Perfect-bound cover files at checkout", () => {
  it("lists every cover document so checkout never resizes it to the page size", () => {
    expect([...perfectCoverDocumentIds({ front: { document_id: "f", page: 0 }, back: { document_id: "b", page: 0 } })]).toEqual(["f", "b"]);
    expect(perfectCoverDocumentIds(undefined).size).toBe(0);
  });
});

describe("Bookshelf front cover follows Cover Studio placement", () => {
  const a4 = { widthMm: 210, heightMm: 297 };
  it("fills trim plus 3 mm bleed at 100% for artwork with A4 bleed proportions", () => {
    const r = frontPanelDrawRect(a4, 3, { x: 0, y: 0, scale: 1 }, 216 / 303, 1);
    expect(r).toEqual({ x: -3, y: -3, w: 216, h: 303 });
  });
  it("applies the customer's move in mm", () => {
    const r = frontPanelDrawRect(a4, 3, { x: 10, y: -5, scale: 1 }, 216 / 303, 1);
    expect(r.x).toBeCloseTo(7); expect(r.y).toBeCloseTo(-8);
  });
  it("keeps odd-sized artwork in proportion instead of squashing it", () => {
    const r = frontPanelDrawRect(a4, 3, undefined, 170 / 236, 1);
    expect(r.w / r.h).toBeCloseTo(170 / 236, 3);
    expect(r.w).toBeCloseTo(216);
  });
});
