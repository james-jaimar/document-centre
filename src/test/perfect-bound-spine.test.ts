import { describe, it, expect } from "vitest";
import { calculateSpine, coverWrapSizeMm, caliperForGsm, gsmFromLabel } from "@/lib/perfectBinding/spine";

describe("perfect-bound spine", () => {
  it("160 duplex pages on 100gsm = 80 sheets → 10.5mm", () => {
    const r = calculateSpine({ pages: 160, duplex: true, gsm: 100 });
    expect(r.sheets).toBe(80);
    expect(r.spineMm).toBe(10.5);
    expect(r.textAllowed).toBe(true);
  });
  it("disables spine text under 4mm", () => {
    const r = calculateSpine({ pages: 40, duplex: true, gsm: 80 });
    expect(r.spineMm).toBe(2.6);
    expect(r.textAllowed).toBe(false);
  });
  it("simplex counts every page as a sheet", () => {
    expect(calculateSpine({ pages: 50, duplex: false, gsm: 80 }).sheets).toBe(50);
  });
  it("A4 wrap with 10.5mm spine + 3mm bleed = 436.5 x 303", () => {
    expect(coverWrapSizeMm({ widthMm: 210, heightMm: 297 }, 10.5)).toEqual({ widthMm: 436.5, heightMm: 303 });
  });
  it("defaults to 80gsm and reads gsm from labels", () => {
    expect(caliperForGsm(null)).toBe(0.104);
    expect(gsmFromLabel("100gsm Laser")).toBe(100);
  });
});
