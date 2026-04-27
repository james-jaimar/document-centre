import { describe, it, expect } from "vitest";
import {
  getBindingImage,
  normaliseBindingColor,
  type BindingMethod,
  type BindingColor,
} from "./bindingAssets";
import { BINDING_STANDARD } from "@/lib/productOptionValues";

describe("getBindingImage — direct map", () => {
  const cases: Array<{
    method: BindingMethod;
    color: BindingColor;
    orientation: "portrait" | "landscape";
    state: "closed" | "open";
    pngContains: string;
  }> = [
    { method: "comb",      color: "black",  orientation: "portrait",  state: "closed", pngContains: "comb-binding-black-front" },
    { method: "comb",      color: "black",  orientation: "portrait",  state: "open",   pngContains: "comb-binding-open" },
    { method: "comb",      color: "black",  orientation: "landscape", state: "closed", pngContains: "210mm" },
    { method: "comb",      color: "black",  orientation: "landscape", state: "open",   pngContains: "210mm" },
    { method: "spiral",    color: "black",  orientation: "portrait",  state: "closed", pngContains: "coil-black-front" },
    { method: "spiral",    color: "white",  orientation: "portrait",  state: "open",   pngContains: "coil-white-open" },
    { method: "spiral",    color: "clear",  orientation: "landscape", state: "closed", pngContains: "210mm" },
    { method: "twin_loop", color: "black",  orientation: "portrait",  state: "closed", pngContains: "wire-black-front" },
    { method: "twin_loop", color: "silver", orientation: "landscape", state: "open",   pngContains: "210mm" },
  ];

  it.each(cases)("returns a PNG URL for $method/$color/$orientation/$state", (c) => {
    const src = getBindingImage(c);
    expect(src).toBeTruthy();
    expect(typeof src).toBe("string");
  });

  it("returns null for unregistered combinations (e.g. comb white)", () => {
    expect(
      getBindingImage({
        method: "comb",
        color: "white",
        orientation: "portrait",
        state: "closed",
      }),
    ).toBeNull();
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

describe("Every seeded standard binding option has all four images", () => {
  // Each Binding option in BINDING_STANDARD must have:
  // portrait closed, portrait open, landscape closed, landscape open.
  const supportedMethods = new Set(["comb", "spiral", "twin_loop"]);
  const supportedColors = new Set(["black", "white", "clear", "silver"]);

  for (const opt of BINDING_STANDARD) {
    const method = opt.metadata.binding_method as BindingMethod;
    const color = normaliseBindingColor(opt.metadata.color as string);
    if (!supportedMethods.has(method)) continue;
    if (!supportedColors.has(color)) continue;

    for (const orientation of ["portrait", "landscape"] as const) {
      for (const state of ["closed", "open"] as const) {
        it(`${opt.label} → ${orientation}/${state}`, () => {
          expect(getBindingImage({ method, color, orientation, state })).toBeTruthy();
        });
      }
    }
  }
});
