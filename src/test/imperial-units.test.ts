import { describe, it, expect } from "vitest";
import {
  formatSize,
  formatLength,
  localiseLabel,
  formatPaperWeight,
  defaultBleedMm,
  resolveUnitSystem,
} from "@/lib/units";
import { getSuggestedIsoSizes, detectNonIsoSize, matchKnownSize } from "@/lib/paperSizes";

describe("imperial display layer", () => {
  it("formats sizes in inches", () => {
    expect(formatSize(215.9, 279.4, "imperial")).toMatch(/8\.5.*11/);
    expect(formatSize(210, 297, "metric")).toContain("mm");
  });

  it("uses 0.125\" bleed for imperial", () => {
    expect(defaultBleedMm("imperial")).toBeCloseTo(3.175, 3);
    expect(defaultBleedMm("metric")).toBe(3);
  });

  it("converts gsm to pound stock", () => {
    expect(formatPaperWeight(80, "imperial")).toMatch(/lb Bond/);
    expect(formatPaperWeight(300, "imperial")).toMatch(/lb Cover/);
    expect(formatPaperWeight(170, "metric")).toBe("170gsm");
  });

  it("localises catalogue labels", () => {
    const out = localiseLabel("A4 (210 × 297mm) 170gsm Colour Gloss", "imperial");
    expect(out).not.toContain("mm");
    expect(out).not.toContain("gsm");
    expect(out).toContain("Color");
  });

  it("recognises North American sizes", () => {
    expect(matchKnownSize(215.9, 279.4)?.name).toBeTruthy();
    expect(detectNonIsoSize(101.6, 152.4)).toBeTruthy(); // 4 × 6
  });

  it("suggests US scale targets for imperial storefronts", () => {
    const names = getSuggestedIsoSizes(200, 260, null, "imperial").map((s) => s.name);
    expect(names).toContain("Letter");
    expect(names.some((n) => n.startsWith("A"))).toBe(false);
  });

  it("resolves unit system from region", () => {
    expect(resolveUnitSystem("auto", "US")).toBe("imperial");
    expect(resolveUnitSystem("auto", "ZA")).toBe("metric");
    expect(resolveUnitSystem("metric", "US")).toBe("metric");
  });
});
