/**
 * Role-aware section ordering.
 *
 * Document sections are stored with `sort_order` reflecting the order in
 * which the user added them in Step 1. That order is irrelevant for the
 * physical book — a Front Cover added AFTER the Body must still render
 * BEFORE it. This helper applies a stable role-priority sort so every
 * consumer (preview, file list, role-aware sort_order assignment) sees the
 * same physical sequence:
 *
 *   front_cover → body → back_cover → insert / tab (anchored)
 *
 * Within each role the user's `sort_order` is preserved.
 */

export type SectionLikeRole =
  | "front_cover"
  | "body"
  | "back_cover"
  | "insert"
  | "tab"
  | string;

export interface SectionLike {
  section_type: SectionLikeRole;
  sort_order?: number | null;
}

/** Lower rank = comes first in the physical document. */
const ROLE_RANK: Record<string, number> = {
  front_cover: 0,
  body: 1,
  back_cover: 2,
  // Tabs and inserts are anchored into the body sequence at render time —
  // their relative order vs. body sections is decided by `page_range_start`,
  // not this rank, but they sit logically after covers.
  insert: 3,
  tab: 3,
};

function rankFor(type: string): number {
  return ROLE_RANK[type] ?? 1; // unknown roles default to body
}

/**
 * Stable sort by [role rank, original sort_order]. Returns a new array;
 * the input is not mutated.
 */
export function sortSectionsByRole<T extends SectionLike>(sections: T[]): T[] {
  return [...sections]
    .map((s, originalIndex) => ({ s, originalIndex }))
    .sort((a, b) => {
      const ra = rankFor(a.s.section_type);
      const rb = rankFor(b.s.section_type);
      if (ra !== rb) return ra - rb;
      const sa = a.s.sort_order ?? a.originalIndex;
      const sb = b.s.sort_order ?? b.originalIndex;
      if (sa !== sb) return sa - sb;
      return a.originalIndex - b.originalIndex;
    })
    .map((x) => x.s);
}

/**
 * Compute a `sort_order` for a NEW section about to be inserted, so that
 * within the existing array it lands at the correct role-aware position
 * (after the last section of equal-or-lower rank). Used by Step 1 to keep
 * DB rows tidy for downstream consumers (e.g. buildJobSnapshot).
 */
export function nextSortOrderForRole(
  existing: SectionLike[],
  newType: SectionLikeRole,
): number {
  const newRank = rankFor(newType);
  let max = -1;
  for (const s of existing) {
    if (rankFor(s.section_type) <= newRank) {
      const so = s.sort_order ?? -1;
      if (so > max) max = so;
    }
  }
  return max + 1;
}
