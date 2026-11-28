import { describe, it, expect } from "vitest";
import { foldPlan, hingeProgress, hingeAngle } from "@/lib/brochure/fold3d";

const zOf = (edge: "left" | "right", angle: number) => {
  const x = edge === "right" ? -1 : 1; // flap point relative to hinge
  return -x * Math.sin(angle); // three.js Ry
};

describe("leaflet fold plan", () => {
  it("roll fold folds the left flap before the cover", () => {
    const { root, hinges } = foldPlan("tri_fold", 3);
    expect(root).toBe(1);
    expect(hingeProgress(0.5, 1, 2)).toBe(1);
    expect(hingeProgress(0.5, 2, 2)).toBe(0);
    expect(hinges.every((h) => h.dir === "behind")).toBe(true);
  });
  it("behind flaps move away from the outside face, front flaps toward it", () => {
    expect(zOf("right", hingeAngle("right", "behind", 0.5))).toBeLessThan(0);
    expect(zOf("left", hingeAngle("left", "behind", 0.5))).toBeLessThan(0);
    expect(zOf("right", hingeAngle("right", "front", 0.5))).toBeGreaterThan(0);
  });
  it("z-fold alternates directions", () => {
    const dirs = foldPlan("z_fold", 3).hinges.map((h) => h.dir);
    expect(dirs).toEqual(["front", "behind"]);
  });
  it("gate fold keeps the centre spread joined", () => {
    const h = foldPlan("gate_fold", 4).hinges.find((x) => x.panel === 2);
    expect(h?.dir).toBeNull();
    expect(h?.parent).toBe(1);
  });
});
