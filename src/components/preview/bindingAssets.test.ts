import { describe, it, expect } from "vitest";
import { resolveBindingArt, normaliseBindingColor } from "./bindingAssets";

describe("resolveBindingArt — strict mapping", () => {
  const cases: Array<{
    method: "spiral" | "comb" | "twin_loop";
    color: "black" | "white" | "clear" | "silver";
    edge: "long" | "short";
    state: "open" | "closed";
  }> = [
    // Comb
    { method: "comb", color: "black", edge: "long", state: "closed" },
    { method: "comb", color: "black", edge: "long", state: "open" },
    { method: "comb", color: "black", edge: "short", state: "closed" },
    { method: "comb", color: "black", edge: "short", state: "open" },
    // Spiral (coil)
    { method: "spiral", color: "black", edge: "long", state: "closed" },
    { method: "spiral", color: "black", edge: "long", state: "open" },
    { method: "spiral", color: "white", edge: "long", state: "closed" },
    { method: "spiral", color: "white", edge: "short", state: "open" },
    { method: "spiral", color: "clear", edge: "long", state: "closed" },
    { method: "spiral", color: "clear", edge: "short", state: "open" },
    // Twin loop wire
    { method: "twin_loop", color: "black", edge: "long", state: "closed" },
    { method: "twin_loop", color: "silver", edge: "short", state: "open" },
  ];

  it.each(cases)(
    "resolves %j to a real PNG URL",
    (req) => {
      const { src, resolved } = resolveBindingArt(req);
      expect(typeof src).toBe("string");
      expect(src.length).toBeGreaterThan(0);
      expect(resolved).toEqual(req);
    },
  );

  it("throws for missing combinations (e.g. comb white)", () => {
    expect(() =>
      resolveBindingArt({
        method: "comb",
        color: "white",
        edge: "long",
        state: "closed",
      }),
    ).toThrow(/No artwork/);
  });
});

describe("normaliseBindingColor", () => {
  it("maps common labels", () => {
    expect(normaliseBindingColor("Black")).toBe("black");
    expect(normaliseBindingColor("Spiral Binding (White)")).toBe("white");
    expect(normaliseBindingColor("Clear")).toBe("clear");
    expect(normaliseBindingColor("Silver")).toBe("silver");
    expect(normaliseBindingColor(undefined)).toBe("black");
  });
});
