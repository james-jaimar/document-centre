import { sortSectionsByRole } from "../orders/sectionOrdering";

export interface BodySection {
  id?: string;
  document_id?: string | null;
  section_type: string;
  sort_order?: number;
  page_range_start?: number | null;
  page_range_end?: number | null;
  is_duplex?: boolean;
  start_on_right?: boolean;
  color?: string | null;
}
export type BodyFace<S> =
  | { kind: "page"; section: S; page: number }
  | { kind: "blank"; section: S; reason: "chapter_recto" | "user_blank" | "simplex_body_back" | "insert_alignment" }
  | { kind: "insert"; section: S; back: boolean; color: string };

/** One entry is one actual PDF face. Anchors count source body pages only. */
export function perfectBodyLayout<S extends BodySection>(sections: S[], documents: { id: string; page_count: number | null }[]): BodyFace<S>[] {
  const faces: BodyFace<S>[] = [];
  const ordered = sortSectionsByRole(sections.map((s) => ({ ...s, sort_order: s.sort_order ?? 0 })));
  const anchors = new Map<number, S[]>();
  for (const s of ordered.filter((s) => s.section_type === "insert")) {
    const anchor = Math.max(0, s.page_range_start ?? 0);
    anchors.set(anchor, [...(anchors.get(anchor) ?? []), s]);
  }
  const emitInserts = (anchor: number) => {
    for (const s of anchors.get(anchor) ?? []) {
      if (s.is_duplex === false) {
        faces.push({ kind: "blank", section: s, reason: "user_blank" });
      } else {
        // A coloured sheet must keep its two faces on the same physical leaf.
        if (faces.length % 2) faces.push({ kind: "blank", section: s, reason: "insert_alignment" });
        for (const back of [false, true]) faces.push({ kind: "insert", section: s, back, color: s.color ?? "white" });
      }
    }
    anchors.delete(anchor);
  };
  let sourcePage = 0;
  emitInserts(0);
  for (const s of ordered.filter((s) => s.section_type === "body")) {
    const count = documents.find((d) => d.id === s.document_id)?.page_count ?? 0;
    const start = Math.max(0, s.page_range_start ?? 0);
    const end = Math.min(count - 1, s.page_range_end ?? count - 1);
    if (end < start) continue;
    if (s.start_on_right !== false && faces.length % 2) faces.push({ kind: "blank", section: s, reason: "chapter_recto" });
    for (let page = start; page <= end; page++) {
      faces.push({ kind: "page", section: s, page });
      if (s.is_duplex === false) faces.push({ kind: "blank", section: s, reason: "simplex_body_back" });
      emitInserts(++sourcePage);
    }
  }
  // Retain deliberately added end inserts after source edits shorten the book.
  for (const anchor of [...anchors.keys()].sort((a, b) => a - b)) emitInserts(anchor);
  return faces;
}