/** Physical fold plan for the WebGL leaflet viewer (no React / three imports). */
export type FoldDir = "behind" | "front"; // relative to the OUTSIDE face of the flat sheet
export interface HingePlan { panel: number; parent: number; edge: "left" | "right"; dir: FoldDir | null; seq: number }

const PLANS: Record<string, { root: number; folds: Record<number, { dir: FoldDir; seq: number }> }> = {
  bi_fold: { root: 0, folds: { 1: { dir: "behind", seq: 1 } } },
  tri_fold: { root: 1, folds: { 0: { dir: "behind", seq: 1 }, 2: { dir: "behind", seq: 2 } } },
  z_fold: { root: 1, folds: { 0: { dir: "front", seq: 1 }, 2: { dir: "behind", seq: 1 } } },
  gate_fold: { root: 1, folds: { 0: { dir: "behind", seq: 1 }, 3: { dir: "behind", seq: 1 } } },
};

/** Each non-root panel hangs off its neighbour towards the root; panels without a fold stay flat. */
export function foldPlan(foldType: string, panelCount: number): { root: number; hinges: HingePlan[] } {
  const p = PLANS[foldType] ?? PLANS.bi_fold;
  const root = Math.min(p.root, panelCount - 1);
  const hinges: HingePlan[] = [];
  for (let i = 0; i < panelCount; i++) {
    if (i === root) continue;
    const f = p.folds[i];
    hinges.push({ panel: i, parent: i < root ? i + 1 : i - 1, edge: i < root ? "right" : "left", dir: f?.dir ?? null, seq: f?.seq ?? 0 });
  }
  return { root, hinges };
}

/** Fold amount 0..1 for one hinge given overall closure t; higher sequences fold after lower ones. */
export function hingeProgress(t: number, seq: number, maxSeq: number): number {
  if (seq <= 0 || maxSeq <= 0) return 0;
  const start = (seq - 1) / maxSeq, end = seq / maxSeq;
  const x = Math.min(1, Math.max(0, (t - start) / (end - start)));
  return x * x * (3 - 2 * x); // smoothstep
}

/** Y rotation (radians) of a flap; sign chosen so the flap swings to the requested side of the sheet. */
export function hingeAngle(edge: "left" | "right", dir: FoldDir, progress: number): number {
  // Flap on the left of its hinge (edge "right"): negative angle swings it to -z (behind).
  const behindSign = edge === "right" ? -1 : 1;
  return (dir === "behind" ? behindSign : -behindSign) * Math.PI * progress;
}
