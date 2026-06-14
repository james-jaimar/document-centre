/**
 * How many copies of a finished size fit on one parent sheet, with normal
 * margins (cut sheet) or full-bleed (SRA3). Edit these here — no DB row needed.
 *
 * Keys are lowercase canonical size codes.
 *
 *   parent  → { finished → ups }
 */
export const IMPOSITION_MAP = {
  sra3: {
    sra3: 1,
    a3: 1,
    a4: 2,
    a5: 4,
    a6: 8,
    dl: 6,
    bc: 24, // 90 × 50 business card
  },
  a3: {
    a3: 1,
    a4: 2,
    a5: 4,
    a6: 8,
  },
  a4: {
    a4: 1,
    a5: 2,
    a6: 4,
  },
} as const satisfies Record<string, Record<string, number>>;

export type ParentSheetCode = keyof typeof IMPOSITION_MAP;
export const PARENT_SHEETS: readonly ParentSheetCode[] = ["a4", "a3", "sra3"];

/** Returns the ups count, or null if the parent can't yield the finished size. */
export function upsCount(parent: string, finished: string): number | null {
  const p = parent.toLowerCase() as ParentSheetCode;
  const f = finished.toLowerCase();
  const row = IMPOSITION_MAP[p];
  if (!row) return null;
  const n = (row as Record<string, number>)[f];
  return n ?? null;
}

/** How many whole parent sheets are needed to yield `quantity` finished pieces. */
export function sheetsNeeded(parent: string, finished: string, quantity: number): number {
  const ups = upsCount(parent, finished);
  if (!ups) return 0;
  return Math.ceil(Math.max(1, quantity) / ups);
}
