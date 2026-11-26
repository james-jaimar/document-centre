import { describe, expect, it } from "vitest";
import { perfectBodyLayout } from "@/lib/perfectBinding/bodyLayout";
import { buildJobSnapshot, type DocumentSectionRow, type MergeDirective } from "@/lib/orders/buildJobSnapshot";
import { buildPreviewSnapshot } from "@/lib/orders/buildPreviewSnapshot";
import { bodySpine } from "@/lib/perfectBinding/workflow";
import { placedJobBookshelfSnapshot, copyBookshelfSnapshot } from "../../supabase/functions/order-engine/bookshelf-rules";

const section = (id: string, sort_order: number, extra: Partial<DocumentSectionRow> = {}): DocumentSectionRow & { document_id: string | null } => ({
  id, document_id: id, section_type: "body", sort_order, page_range_start: null, page_range_end: null,
  label: null, color: null, paper_stock: null, paper_weight_gsm: 80, is_color: false, is_duplex: true, lamination: null, ...extra,
});
const docs = [151, 4].map((page_count, i) => ({ id: i ? "b" : "a", asset_id: i ? "asset-b" : "asset-a", file_name: `${i ? "b" : "a"}.pdf`, page_count,
  thumbnail_urls: Array.from({ length: page_count }, (_, p) => `${i ? "b" : "a"}-${p}.png`),
  file_size: 100, page_width_mm: 210, page_height_mm: 297, storage_path: `${i ? "b" : "a"}.pdf`, file_path: `${i ? "b" : "a"}.pdf`,
}));
const sections = [section("a", 0), section("b", 1)];
const frozen = (s = sections) => buildJobSnapshot({ item: { id: "item", quantity: 1, title: "Book", product_family_id: "family", product_families: { slug: "perf-bound" }, spec: { page_count: 156 } }, productOptions: [], sections: s, documents: docs });

describe("perfect-bound physical page plan", () => {
  it("defaults the chapter after 151 pages to page 153 with a real blank at page 152", () => {
    const faces = perfectBodyLayout(sections, docs);
    expect(faces[151]).toMatchObject({ kind: "blank", reason: "chapter_recto" });
    expect(faces[152]).toMatchObject({ kind: "page", section: { id: "b" }, page: 0 });
    expect(faces).toHaveLength(156);
    expect(bodySpine(sections, docs, 80).sheets).toBe(78);
    expect(frozen().configuration.merge_directives).toMatchObject([
      { kind: "section", page_range_start: 0, page_range_end: 150 },
      { kind: "blank_page", reason: "chapter_recto" },
      { kind: "section", page_range_start: 0, page_range_end: 3 },
    ]);
  });
  it("lets a chapter start on the left when its switch is off", () => {
    const faces = perfectBodyLayout([sections[0], { ...sections[1], start_on_right: false }], docs);
    expect(faces).toHaveLength(155);
    expect(faces[151]).toMatchObject({ kind: "page", section: { id: "b" }, page: 0 });
  });
  it("does not include protruding tabs in a perfect-bound body", () => {
    const tab = section("tab", 2, { document_id: null, section_type: "tab", page_range_start: 5 });
    expect(perfectBodyLayout([...sections, tab], docs)).toHaveLength(156);
    expect(perfectBodyLayout([...sections, tab], docs).some((f) => f.section.section_type === "tab")).toBe(false);
  });
  it("recalculates alignment after changing a source range instead of keeping a stale blank", () => {
    const faces = perfectBodyLayout([{ ...sections[0], page_range_end: 149 }, sections[1]], docs);
    expect(faces).toHaveLength(154);
    expect(faces[150]).toMatchObject({ kind: "page", section: { id: "b" } });
    expect(faces.some((f) => f.kind === "blank")).toBe(false);
  });
  it("inserts one manual blank immediately after the chosen source page and splits the PDF directive", () => {
    const manual = section("blank", 2, { document_id: null, section_type: "insert", page_range_start: 5, is_duplex: false });
    const s = [...sections, manual];
    expect(perfectBodyLayout(s, docs)[5]).toMatchObject({ kind: "blank", reason: "user_blank" });
    expect(frozen(s).configuration.merge_directives).toMatchObject([
      { kind: "section", page_range_start: 0, page_range_end: 4 },
      { kind: "blank_page", reason: "user_blank" },
      { kind: "section", page_range_start: 5, page_range_end: 150 },
      { kind: "section", page_range_start: 0, page_range_end: 3 },
    ]);
  });
  it("keeps both coloured insert faces on one leaf, adding a real alignment blank when needed", () => {
    const insert = section("insert", 2, { document_id: null, section_type: "insert", page_range_start: 5, color: "yellow" });
    const faces = perfectBodyLayout([...sections, insert], docs);
    expect(faces.slice(5, 9)).toMatchObject([
      { kind: "blank", reason: "insert_alignment" }, { kind: "insert", color: "yellow", back: false },
      { kind: "insert", color: "yellow", back: true }, { kind: "page", page: 5 },
    ]);
    expect((frozen([...sections, insert]).configuration.merge_directives as MergeDirective[]).filter((d) => d.kind === "insert_page")).toHaveLength(2);
  });
  it("makes simplex reverse faces explicit so the worker cannot double-pad them", () => {
    const s = [section("a", 0, { page_range_end: 1, is_duplex: false })];
    const faces = perfectBodyLayout(s, docs);
    expect(faces.map((f) => f.kind)).toEqual(["page", "blank", "page", "blank"]);
    expect((frozen(s).configuration.merge_directives as MergeDirective[]).filter((d) => d.kind === "section").every((d) => d.layout_explicit)).toBe(true);
  });
  it("persists the same real blank position in the inside-page preview", () => {
    const preview = buildPreviewSnapshot({ productType: "perfect_bound", selectedOptions: {}, productOptions: [], sections, documents: docs });
    expect(preview.pageRoles[151]).toBe("blank_back");
    expect(preview.thumbnails[152]).toBe("b-0.png");
  });
  it("keeps chapter switches and manual blanks editable when saving a placed order and copying it", async () => {
    const s = [sections[0], { ...sections[1], start_on_right: false }, section("blank", 2, { document_id: null, section_type: "insert", page_range_start: 5, is_duplex: false, color: "white" })];
    const job = frozen(s);
    const snap = placedJobBookshelfSnapshot(job, docs.map((d) => ({ id: d.asset_id, source_storage_path: d.file_path, page_count: d.page_count })), [], () => crypto.randomUUID());
    expect(snap.sections).toHaveLength(3);
    expect(snap.sections[1].start_on_right).toBe(false);
    expect(snap.sections[2]).toMatchObject({ section_type: "insert", is_duplex: false, page_range_start: 5 });
    const copy = await copyBookshelfSnapshot(snap, "copy", async () => {});
    expect(copy.sections[1].start_on_right).toBe(false);
    expect(perfectBodyLayout(copy.sections, copy.documents)).toHaveLength(156);
  });
});