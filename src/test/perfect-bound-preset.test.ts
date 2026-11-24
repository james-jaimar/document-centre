import { describe, it, expect } from "vitest";
import { PERFECT_BOUND_OPTIONS, perfectBindingFinishing } from "@/lib/perfectBinding/preset";
describe("catalogue-backed perfect-bound setup", () => {
  it("does not offer wire or comb binding in a perfect-bound product", () => {
    expect(perfectBindingFinishing({ binding_method: "twin_loop", label: "Wire Black" })).toBe(false);
    expect(perfectBindingFinishing({ binding_method: "comb" })).toBe(false);
    expect(perfectBindingFinishing({ binding_method: "perfect" })).toBe(true);
    expect(PERFECT_BOUND_OPTIONS.find((o) => o.name === "Binding")?.source_filter).toEqual({ category: "binding", binding_method: "perfect" });
  });
  it("separates text stock from cover stock and leaves all prices to the catalogue", () => {
    expect(PERFECT_BOUND_OPTIONS.find((o) => o.name === "Paper Stock")?.source_filter).toEqual({ categories: ["bond", "text", "coated"] });
    expect(PERFECT_BOUND_OPTIONS.find((o) => o.name === "Cover Stock")?.source_filter).toEqual({ categories: ["cover"] });
    expect(PERFECT_BOUND_OPTIONS.filter((o) => o.name !== "Cover Printing").every((o) => o.source.startsWith("catalog.") && !("price" in o))).toBe(true);
    expect(PERFECT_BOUND_OPTIONS.find((o) => o.name === "Cover Printing")?.source).toBe("manual");
  });
});