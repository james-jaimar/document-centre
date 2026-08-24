import { describe, expect, it } from "vitest";
import { isImperialOnlyPaper } from "@/hooks/useCatalog";

describe("catalogue paper unit guard", () => {
  it("identifies US-native lb and point stocks", () => {
    expect(isImperialOnlyPaper({ code: "us-80lb-cover", label: "80lb Cover" })).toBe(true);
    expect(isImperialOnlyPaper({ code: "c2s-14", label: "14pt C2S" })).toBe(true);
    expect(
      isImperialOnlyPaper({ code: "bond", label: "Bond", metadata: { region: "US" } }),
    ).toBe(true);
  });

  it("allows metric stock labels", () => {
    expect(isImperialOnlyPaper({ code: "80gsm-bond", label: "80gsm Bond" })).toBe(false);
    expect(isImperialOnlyPaper({ code: "photo-gloss", label: "Gloss Photo" })).toBe(false);
  });
});