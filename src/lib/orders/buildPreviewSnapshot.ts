/**
 * Builds a fully resolved preview snapshot at place-order time so the
 * read-only preview on the placed-order detail page can render the
 * customer's exact chosen finishing options (bleed, paper colour,
 * lamination, covers, tabs, inserts, etc.) — not the default state.
 *
 * Mirrors the live computation in PreviewPanel + OrderBuild. Persisted
 * into job.configuration.preview alongside the existing thumbnails +
 * product_type so CustomerOrderDetail/AdminOrderDetail can pass the full
 * set of props into PreviewLightbox.
 */
import type {
  PreviewEffects,
  ProductPreviewType,
  TabPosition,
} from "@/components/preview/previewTypes";
import { DEFAULT_PREVIEW_EFFECTS, TAB_COLORS } from "@/components/preview/previewTypes";
import {
  isStructuredValues,
  type StructuredOptionValue,
} from "@/lib/productOptionTypes";

interface DocLike {
  id: string;
  file_name: string;
  page_count: number | null;
  page_width_mm?: number | null;
  page_height_mm?: number | null;
  thumbnail_urls: unknown;
}

interface SectionLike {
  id: string;
  document_id: string | null;
  section_type: string;
  page_range_start: number | null;
  page_range_end: number | null;
  is_color: boolean;
  is_duplex: boolean;
  label: string | null;
  color: string | null;
  sort_order: number;
}

interface OptionLike {
  name: string;
  values: unknown;
}

interface PageInfo {
  thumbnailUrl: string;
  pageIndex: number;
  isColor: boolean;
  section?: SectionLike;
  label?: string;
  color?: string;
}

const BOUND_TYPES = new Set<ProductPreviewType>([
  "wire_bound", "comb_bound", "saddle_stitched", "perfect_bound", "ring_binder",
]);

const NON_CONTENT_ROLES = new Set([
  "tab", "tab_back", "insert", "insert_back", "blank_back",
  "pvc_cover_front", "pvc_cover_back",
  "inside_back_cover_card", "back_cover_card", "inside_back_blank",
]);

function resolveEffects(
  selectedOptions: Record<string, string>,
  productOptions: OptionLike[],
): PreviewEffects {
  const fx: PreviewEffects = { ...DEFAULT_PREVIEW_EFFECTS };

  const getMetadata = (optionName: string): Record<string, any> | null => {
    const opt = productOptions.find(
      (o) => o.name.toLowerCase() === optionName.toLowerCase(),
    );
    if (!opt || !isStructuredValues(opt.values)) return null;
    const key =
      Object.keys(selectedOptions).find(
        (k) => k.toLowerCase() === opt.name.toLowerCase(),
      ) || opt.name;
    const slug = selectedOptions[key];
    if (!slug) return null;
    const val = (opt.values as StructuredOptionValue[]).find(
      (v) => v.slug === slug,
    );
    return (val?.metadata as Record<string, any>) ?? null;
  };

  const edgeMeta = getMetadata("Print to Edge");
  if (edgeMeta?.bleed === true) {
    const scope = edgeMeta.scope as string | undefined;
    fx.bleed =
      scope === "all" || scope === "front_cover" || scope === "covers"
        ? (scope as PreviewEffects["bleed"])
        : "all";
  }

  const coverMeta = getMetadata("Covers");
  if (coverMeta) {
    if (coverMeta.front) fx.frontCover = coverMeta.front as PreviewEffects["frontCover"];
    if (coverMeta.back) fx.backCover = coverMeta.back as PreviewEffects["backCover"];
  }

  const paperMeta = getMetadata("Paper Stock");
  if (paperMeta?.color) fx.paperColor = paperMeta.color as string;

  const holeMeta = getMetadata("Hole Punching");
  if (holeMeta?.holes) fx.holePunch = holeMeta.holes as 0 | 2 | 4;

  const lamMeta = getMetadata("Cover Lamination");
  if (lamMeta?.finish) fx.coverLamination = lamMeta.finish as PreviewEffects["coverLamination"];

  return fx;
}

function resolveBindingEdge(
  selectedOptions: Record<string, string>,
  productOptions: OptionLike[],
): "left" | "top" {
  const sizeOpt = productOptions.find(
    (o) => o.name.toLowerCase() === "document size",
  );
  if (!sizeOpt || !isStructuredValues(sizeOpt.values)) return "left";
  const key =
    Object.keys(selectedOptions).find(
      (k) => k.toLowerCase() === sizeOpt.name.toLowerCase(),
    ) || sizeOpt.name;
  const slug = selectedOptions[key];
  if (!slug) return "left";
  const val = (sizeOpt.values as StructuredOptionValue[]).find(
    (v) => v.slug === slug,
  );
  return (val?.metadata as Record<string, any>)?.binding_edge === "top"
    ? "top"
    : "left";
}

/** Mirrors PreviewPanel.buildPageSequence */
function buildPageSequence(
  sections: SectionLike[],
  documents: DocLike[],
  isBound: boolean,
  productType: ProductPreviewType,
): PageInfo[] {
  const forceDuplex = productType === "saddle_stitched";
  const bodySections = sections.filter(
    (s) => s.section_type !== "tab" && s.section_type !== "insert",
  );
  const anchoredSections = sections.filter(
    (s) => s.section_type === "tab" || s.section_type === "insert",
  );

  const anchorMap = new Map<number, SectionLike[]>();
  for (const s of anchoredSections) {
    const anchor = s.page_range_start ?? 0;
    const list = anchorMap.get(anchor) || [];
    list.push(s);
    anchorMap.set(anchor, list);
  }

  const result: PageInfo[] = [];
  let pageNum = 0;
  let pending: SectionLike[] = [];

  const emitDivider = (item: SectionLike) => {
    if (item.section_type === "tab") {
      result.push({
        thumbnailUrl: "", pageIndex: 0, isColor: true, section: item,
        label: item.label || undefined, color: item.color || undefined,
      });
      result.push({
        thumbnailUrl: "", pageIndex: -1, isColor: true, section: item,
        label: item.label || undefined, color: item.color || undefined,
      });
    } else if (item.section_type === "insert") {
      const insertColor = item.color || "white";
      result.push({
        thumbnailUrl: "", pageIndex: 0, isColor: true, section: item,
        color: insertColor,
      });
      result.push({
        thumbnailUrl: "", pageIndex: -1, isColor: true, section: item,
        color: insertColor,
      });
    }
  };

  const tryFlush = () => {
    if (pending.length === 0) return;
    if (!isBound || result.length % 2 === 0) {
      for (const item of pending) emitDivider(item);
      pending = [];
    }
  };

  // Sort documents by sort_order so fallback indexing is deterministic
  const sortedDocs = [...documents].sort((a: any, b: any) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  let bodyIdx = 0;
  for (const section of bodySections) {
    // Primary: match by document_id. Fallback: when a section's document_id
    // is missing or stale (e.g. after a clone-from-cart edit), pair body
    // sections positionally with the available documents so we always emit
    // pages instead of silently producing an empty preview.
    let doc = section.document_id
      ? documents.find((d) => d.id === section.document_id)
      : undefined;
    if (!doc) {
      doc = sortedDocs[bodyIdx] ?? sortedDocs[0];
    }
    bodyIdx++;
    if (!doc) continue;
    const rawThumbs = Array.isArray(doc.thumbnail_urls)
      ? (doc.thumbnail_urls as any[])
      : [];
    const thumbnails = rawThumbs.map((t: any) =>
      typeof t === "string" ? t : (t?.path || t?.url || ""),
    );
    const pageCount = doc.page_count ?? thumbnails.length;

    for (let i = 0; i < pageCount; i++) {
      pageNum++;
      tryFlush();

      result.push({
        thumbnailUrl: thumbnails[i] ?? "",
        pageIndex: i,
        isColor: section.is_color,
        section,
      });

      if (!section.is_duplex && !forceDuplex) {
        result.push({
          thumbnailUrl: "", pageIndex: -1, isColor: section.is_color, section,
        });
      }

      const anchored = anchorMap.get(pageNum);
      if (anchored) pending.push(...anchored);

      tryFlush();
    }
  }

  for (const item of pending) emitDivider(item);
  return result;
}

export interface PreviewSnapshot {
  thumbnails: string[];
  product_type: ProductPreviewType;
  effects: PreviewEffects;
  bindingEdge: "left" | "top";
  pageAspectRatio: number | null;
  colorFlags: boolean[];
  bleedFlags: boolean[];
  pageRoles: string[];
  sectionTypes: string[];
  pageLabels: string[];
  pageColors: string[];
  tabPositions: TabPosition[];
  displayPageNumbers: (number | null)[];
  faceLabels: string[];
}

export function buildPreviewSnapshot(input: {
  productType: ProductPreviewType;
  selectedOptions: Record<string, string>;
  productOptions: OptionLike[];
  sections: SectionLike[];
  documents: DocLike[];
}): PreviewSnapshot {
  const { productType, selectedOptions, productOptions, sections, documents } = input;
  const isBound = BOUND_TYPES.has(productType);

  const effects = resolveEffects(selectedOptions, productOptions);
  const bindingEdge = resolveBindingEdge(selectedOptions, productOptions);

  const sortedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const pages = buildPageSequence(sortedSections, documents, isBound, productType);

  // Apply role enrichment + physical covers (mirrors PreviewPanel)
  const fp: PageInfo[] = [...pages];
  const roles: string[] = fp.map((p) => {
    if (p.pageIndex === -1 && p.section?.section_type === "insert") return "insert_back";
    if (p.pageIndex === -1 && p.section?.section_type === "tab") return "tab_back";
    if (p.pageIndex === -1 && p.thumbnailUrl === "") return "blank_back";
    if (p.section?.section_type === "tab") return "tab";
    if (p.section?.section_type === "insert") return "insert";
    if (p.section?.section_type === "front_cover") return "front_cover";
    return "body";
  });

  // Ring binders implicitly have a clear PVC front pocket — but only inject
  // the pocket pages when a Cover Sheet section is actually assigned.
  const hasFrontCoverSection = fp[0]?.section?.section_type === "front_cover";
  const isRingBinder = productType === "ring_binder";
  const isPvcOption =
    effects.frontCover &&
    ["clear_pvc", "frosted_pvc", "matte_pvc"].includes(effects.frontCover);
  const isPvc =
    isBound &&
    ((isPvcOption && fp.length > 0) ||
      (isRingBinder && hasFrontCoverSection));
  if (isPvc && fp.length > 0) {
    const frontThumb = fp[0]?.thumbnailUrl ?? "";
    fp.unshift({ thumbnailUrl: frontThumb, pageIndex: 0, isColor: true });
    roles.unshift("pvc_cover_front");
    fp.splice(1, 0, { thumbnailUrl: "", pageIndex: 0, isColor: true });
    roles.splice(1, 0, "pvc_cover_back");
  }

  const hasBackCover = isBound && effects.backCover && effects.backCover !== "none";
  if (isBound) {
    if (hasBackCover) {
      if (fp.length % 2 !== 0) {
        fp.push({ thumbnailUrl: "", pageIndex: 0, isColor: true });
        roles.push("inside_back_blank");
      }
      fp.push({ thumbnailUrl: "", pageIndex: 0, isColor: true });
      roles.push("inside_back_cover_card");
      fp.push({ thumbnailUrl: "", pageIndex: 0, isColor: true });
      roles.push("back_cover_card");
    } else if (fp.length % 2 !== 0) {
      fp.push({ thumbnailUrl: "", pageIndex: 0, isColor: true });
      roles.push("inside_back_blank");
    }
  }

  // ── Multicolor tab cycling: assign cycled hex to each tab face's `color` ──
  // so PageEffects renders the sheet body in the same hue as the protrusion.
  const tabFaceIndices = roles
    .map((r, i) => (r === "tab" || r === "tab_back" ? i : -1))
    .filter((i) => i >= 0);
  // Group into pairs: each tab section emits [tab, tab_back] consecutively
  const tabPairs: Array<[number, number]> = [];
  for (let i = 0; i + 1 < tabFaceIndices.length; i += 2) {
    tabPairs.push([tabFaceIndices[i], tabFaceIndices[i + 1]]);
  }
  tabPairs.forEach(([frontIdx, backIdx], tabIdx) => {
    const front = fp[frontIdx];
    const existing = (front?.color || "").trim().toLowerCase();
    const isMulti = !existing || existing === "multi" || existing === "multicolor";
    if (!isMulti) return;
    const hex = TAB_COLORS[tabIdx % TAB_COLORS.length];
    if (fp[frontIdx]) fp[frontIdx] = { ...fp[frontIdx], color: hex };
    if (fp[backIdx]) fp[backIdx] = { ...fp[backIdx], color: hex };
  });

  const thumbnails = fp.map((p) => p.thumbnailUrl);
  const colorFlags = fp.map((p) => p.isColor);
  const sectionTypes = fp.map((p) => p.section?.section_type ?? "body");
  const pageLabels = fp.map((p) => p.label ?? "");
  const pageColors = fp.map((p) => p.color ?? "");

  const bleedScope = effects.bleed;
  const bleedFlags = roles.map((role) => {
    if (
      ["pvc_cover_front", "pvc_cover_back", "inside_back_cover_card", "back_cover_card"].includes(role)
    )
      return true;
    if (["blank_back", "inside_back_blank"].includes(role)) return false;
    if (bleedScope === "all") return true;
    if (bleedScope === "none") return false;
    if (bleedScope === "front_cover" && role === "front_cover") return true;
    if (bleedScope === "covers" && (role === "front_cover" || role === "back_cover")) return true;
    return false;
  });

  let num = 0;
  const displayPageNumbers: (number | null)[] = roles.map((role) => {
    if (NON_CONTENT_ROLES.has(role)) return null;
    num++;
    return num;
  });

  const tabPositions: TabPosition[] = [];
  const tabRoleIndices = roles
    .map((r, i) => (r === "tab" ? i : -1))
    .filter((i) => i >= 0);
  const tabTotal = tabRoleIndices.length;
  tabRoleIndices.forEach((pageIdx, tabIdx) => {
    const page = fp[pageIdx];
    tabPositions.push({
      pageIndex: pageIdx,
      label: page?.label || `Tab ${tabIdx + 1}`,
      tabIndex: tabIdx,
      tabTotal,
      color: page?.color || "",
    });
  });

  const docWithSize = documents.find((d) => d.page_width_mm && d.page_height_mm);
  const pageAspectRatio =
    docWithSize && docWithSize.page_width_mm && docWithSize.page_height_mm
      ? Number(docWithSize.page_width_mm) / Number(docWithSize.page_height_mm)
      : null;

  const roleFriendlyName = (role: string): string => {
    switch (role) {
      case "tab": return "Tab Divider";
      case "tab_back": return "Tab Divider (Back)";
      case "insert": return "Insert Sheet";
      case "insert_back": return "Insert Sheet (Back)";
      case "blank_back": return "Blank (Back)";
      case "pvc_cover_front": return "Front Cover (PVC)";
      case "pvc_cover_back": return "PVC Cover (Inside)";
      case "inside_back_cover_card": return "Back Cover (Inside)";
      case "back_cover_card": return "Back Cover";
      case "inside_back_blank": return "Blank (Inside Back)";
      default: return "";
    }
  };
  const faceLabels = roles.map((r, i) => {
    const dpn = displayPageNumbers[i];
    return dpn !== null ? `Page ${dpn}` : roleFriendlyName(r);
  });

  return {
    thumbnails,
    product_type: productType,
    effects,
    bindingEdge,
    pageAspectRatio,
    colorFlags,
    bleedFlags,
    pageRoles: roles,
    sectionTypes,
    pageLabels,
    pageColors,
    tabPositions,
    displayPageNumbers,
    faceLabels,
  };
}
