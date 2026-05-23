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
import { selectedBindingArt } from "@/lib/orders/selectedBindingArt";
import { sortSectionsByRole } from "@/lib/orders/sectionOrdering";

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
  /** Physical slot 1..10 within a pre-cut tab pack. Only set for section_type='tab'. */
  bank_position?: number | null;
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
  documents: DocLike[],
): "left" | "top" {
  // 1. Document geometry wins when known.
  const doc = documents.find((d) => d.page_width_mm && d.page_height_mm);
  if (doc?.page_width_mm && doc?.page_height_mm) {
    return Number(doc.page_width_mm) > Number(doc.page_height_mm)
      ? "top"
      : "left";
  }
  // 2. Fallback to Document Size metadata.
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
  const meta = (val?.metadata as Record<string, any>) ?? {};
  if (meta.binding_edge === "top" || meta.binding_edge === "short") return "top";
  if (meta.orientation === "landscape") return "top";
  return "left";
}

// Binding art derivation moved to `selectedBindingArt` so the live builder
// (OrderBuild) and the saved/admin snapshot here always agree.


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
  for (let bIdx = 0; bIdx < bodySections.length; bIdx++) {
    const section = bodySections[bIdx];
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
    const rangeStart = section.page_range_start ?? 0;
    const rangeEnd = section.page_range_end ?? (pageCount - 1);
    const boundedEnd = Math.min(rangeEnd, pageCount - 1);
    const selectedPageCount = Math.max(0, boundedEnd - rangeStart + 1);
    const nextSection = bodySections[bIdx + 1];
    const isCoverSection = section.section_type === "front_cover" || section.section_type === "back_cover";
    const isSimplexCover =
      isBound &&
      isCoverSection &&
      !section.is_duplex &&
      selectedPageCount === 1;

    // ── Simplex back cover gets a blank face PRECEDING it ──
    // A 1-page back-cover upload is one physical sheet whose inside
    // (the face the customer sees right before the cover) is a real blank.
    if (isSimplexCover && section.section_type === "back_cover") {
      result.push({
        thumbnailUrl: "", pageIndex: -1, isColor: true, section,
      });
    }

    for (let i = rangeStart; i <= boundedEnd; i++) {
      pageNum++;
      tryFlush();

      result.push({
        thumbnailUrl: thumbnails[i] ?? "",
        pageIndex: i,
        isColor: section.is_color,
        section,
      });

      // Determine document boundary so we can suppress the synthetic
      // simplex blank_back face between two different documents. See
      // the matching comment in PreviewPanel.tsx#buildPageSequence.
      const isLastPageOfDoc = i === boundedEnd || i === pageCount - 1;
      let nextDoc: DocLike | undefined;
      if (nextSection) {
        nextDoc = nextSection.document_id
          ? documents.find((d) => d.id === nextSection.document_id)
          : sortedDocs[bodyIdx] ?? sortedDocs[0];
      }
      const nextIsDifferentDoc = isLastPageOfDoc && !!nextDoc && nextDoc.id !== doc.id;
      const isFinalBodyPage = isLastPageOfDoc && !nextSection;

      // Queue any dividers anchored after this page number FIRST so we
      // know whether parity matters for an upcoming divider.
      const anchored = anchorMap.get(pageNum);
      if (anchored) pending.push(...anchored);

      const hasPendingDivider = pending.length > 0;

      // Simplex: push natural reverse face for ALL bound types including ring binders,
      // EXCEPT at document boundaries / end-of-body (parity for back covers and
      // dividers is handled separately below / by tryFlush()).
      if (!section.is_duplex && !forceDuplex && !isCoverSection) {
        // Ring binders: never skip the trailing blank_back — each body page
        // is a real physical sheet with a genuinely blank reverse, and there
        // is no back-cover sheet to absorb the parity.
        const skipBlankBack =
          productType !== "ring_binder" &&
          (nextIsDifferentDoc || isFinalBodyPage) && !hasPendingDivider;
        if (!skipBlankBack) {
          result.push({
            thumbnailUrl: "", pageIndex: -1, isColor: section.is_color, section,
          });
        }
      }

      tryFlush();
    }

    // ── Simplex front cover gets a blank face FOLLOWING it ──
    if (isSimplexCover && section.section_type === "front_cover") {
      result.push({
        thumbnailUrl: "", pageIndex: -1, isColor: true, section,
      });
    }
  }

  for (const item of pending) emitDivider(item);

  // ── Saddle-stitched booklet padding: total pages must be divisible by 4 ──
  if (productType === "saddle_stitched") {
    const contentCount = result.length;
    const remainder = contentCount % 4;
    if (remainder !== 0) {
      const blanksNeeded = 4 - remainder;
      for (let b = 0; b < blanksNeeded; b++) {
        result.push({
          thumbnailUrl: "", pageIndex: -1, isColor: true,
        });
      }
    }
  }

  return result;
}

export interface PreviewSnapshot {
  thumbnails: string[];
  product_type: ProductPreviewType;
  effects: PreviewEffects;
  bindingEdge: "left" | "top";
  bindingArt?: { method: "spiral" | "comb" | "twin_loop"; color: string };
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
  const bindingEdge = resolveBindingEdge(selectedOptions, productOptions, documents);
  const bindingArt = selectedBindingArt(selectedOptions, productOptions);

  const sortedSections = sortSectionsByRole(sections);
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
    if (p.section?.section_type === "back_cover") return "back_cover";
    return "body";
  });

  // Only inject a PVC front sheet when a PVC cover option is explicitly
  // chosen. Ring binders without an uploaded cover should NOT receive a
  // fake PVC sheet derived from the first body page.
  const isPvcOption =
    effects.frontCover &&
    ["clear_pvc", "frosted_pvc", "matte_pvc"].includes(effects.frontCover);
  const isPvc = isBound && isPvcOption && fp.length > 0;
  if (isPvc && fp.length > 0) {
    const frontSource = fp[0];
    fp.unshift({
      thumbnailUrl: frontSource?.thumbnailUrl ?? "",
      pageIndex: 0,
      isColor: frontSource?.isColor ?? true,
    });
    roles.unshift("pvc_cover_front");
    fp.splice(1, 0, { thumbnailUrl: "", pageIndex: 0, isColor: true });
    roles.splice(1, 0, "pvc_cover_back");
  }

  // Ring binder physical model: do NOT prepend any virtual binder faces.
  // The binder hardware (closed view + inside-front-panel) is reconstructed
  // by the viewer at render time via a view-index mapping. The persisted
  // sequence stores ONLY real physical faces (front_cover if uploaded, body,
  // blank_back, tab/tab_back, insert/insert_back).
  const isRingBinder = productType === "ring_binder";

  const hasBackCover = isBound && effects.backCover && effects.backCover !== "none";
  // Ring binders are hardware — they have no printed back cover sheet.
  const skipBackCoverCard = isRingBinder;
  if (isBound && !skipBackCoverCard) {
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

  const isBusinessCards = productType === "business_cards";
  const isPoster = productType === "poster";
  const bleedScope = effects.bleed;
  const bleedFlags = roles.map((role) => {
    // Business cards: server thumbnails are already trim-cropped — always full bleed
    if (isBusinessCards) return true;
    // Posters: artwork is always full-bleed (user cropped to fill page in editor)
    if (isPoster) return true;
    if (
      ["pvc_cover_front", "pvc_cover_back", "inside_back_cover_card", "back_cover_card"].includes(role)
    )
      return true;
    if (["blank_back", "inside_back_blank"].includes(role)) return false;
    // Ring binder body pages sit inside a mechanism — never edge-to-edge.
    if (isRingBinder && role === "body") return false;
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
  let pageAspectRatio: number | null =
    docWithSize && docWithSize.page_width_mm && docWithSize.page_height_mm
      ? Number(docWithSize.page_width_mm) / Number(docWithSize.page_height_mm)
      : null;
  // Business cards fallback: standard 90×50mm = 1.8
  if (pageAspectRatio === null && isBusinessCards) pageAspectRatio = 1.8;

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
    bindingArt,
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
