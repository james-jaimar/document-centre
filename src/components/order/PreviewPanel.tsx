import { useState, useMemo, useRef, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { composePanelImages, resolveUrls } from "@/lib/thumbnailUtils";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FileText,
  Maximize2,
} from "lucide-react";
import PreviewLightbox from "@/components/order/PreviewLightbox";
import DocumentPreview from "@/components/preview/DocumentPreview";
import type { ProductPreviewType, PreviewEffects, TabPosition } from "@/components/preview/previewTypes";
import { TAB_COLORS } from "@/components/preview/previewTypes";
import { ringTotalViews, resolveRingView, stepRingView } from "@/lib/preview/ringBinderModel";
import { sortSectionsByRole } from "@/lib/orders/sectionOrdering";

type Document = Tables<"documents">;
type DocumentSection = Tables<"document_sections">;

interface PreviewPanelProps {
  documents: Document[];
  sections: DocumentSection[];
  productType?: ProductPreviewType;
  effects?: PreviewEffects;
  bindingEdge?: "left" | "top";
}

interface PageInfo {
  thumbnailUrl: string;
  pageIndex: number;
  documentName: string;
  section?: DocumentSection;
  isColor: boolean;
  label?: string;
  color?: string;
}

const SECTION_LABELS: Record<string, string> = {
  front_cover: "Front Cover",
  back_cover: "Back Cover",
  body: "Body",
  insert: "Insert",
  tab: "Tab",
};

const BOUND_TYPES = new Set([
  "wire_bound", "comb_bound", "saddle_stitched", "perfect_bound", "ring_binder",
]);



const FOLD_TYPES = new Set([
  "bi_fold", "tri_fold", "z_fold", "gate_fold",
]);

/**
 * Build a page sequence respecting physical sheet boundaries.
 *
 * PHYSICAL RULE: A tab or insert is a physical sheet. It can only begin
 * after the preceding sheet is complete. For simplex pages, every printed
 * page has a natural reverse face (blank_back). So the order is always:
 *
 *   body page N  →  blank_back (simplex reverse)  →  tab/insert sheet
 *
 * For duplex, two content pages share one sheet, and anchors are snapped
 * to sheet boundaries so tabs/inserts start at the next physical sheet.
 *
 * This function builds the sequence in one pass — no post-processing
 * alignment is needed or should be added.
 */
/**
 * Build the physical face sequence, placing tabs/inserts at the next
 * available RIGHT-hand slot after their anchor page.
 *
 * With react-pageflip's showCover={true}, index 0 is a solo right page,
 * then spreads follow as [1,2], [3,4], etc.  Even indices = RIGHT.
 *
 * Rule: a tab or insert ALWAYS starts on a right-hand page (even index).
 * If the anchor page's faces end on an odd index, the divider waits in a
 * pending queue and is flushed as soon as the next body face restores
 * even parity.  No post-processing alignment pass is needed.
 */
function buildPageSequence(
  sections: DocumentSection[],
  documents: Document[],
  isBound: boolean,
  productType?: ProductPreviewType,
): PageInfo[] {
  // Saddle-stitched booklets are always duplex — skip blank_back injection
  const forceDuplex = productType === "saddle_stitched";
  // Sort by role so Front Cover always renders before Body, regardless of
  // the order the user added them in Step 1.
  const orderedSections = sortSectionsByRole(sections);
  const bodySections = orderedSections.filter(
    (s) => s.section_type !== "tab" && s.section_type !== "insert"
  );
  const anchoredSections = orderedSections.filter(
    (s) => s.section_type === "tab" || s.section_type === "insert"
  );

  // Build anchor map keyed by body-page number (no snapping — parity
  // is handled by the pending-queue flush below)
  const anchorMap = new Map<number, DocumentSection[]>();
  for (const s of anchoredSections) {
    const anchor = s.page_range_start ?? 0;
    const list = anchorMap.get(anchor) || [];
    list.push(s);
    anchorMap.set(anchor, list);
  }

  const result: PageInfo[] = [];
  let pageNum = 0;
  let pending: DocumentSection[] = [];

  // Push a tab or insert (two physical faces) into result
  const emitDivider = (item: DocumentSection) => {
    if (item.section_type === "tab") {
      result.push({
        thumbnailUrl: "", pageIndex: 0, documentName: "Tab Divider",
        section: item, isColor: true,
        label: item.label || undefined, color: item.color || undefined,
      });
      result.push({
        thumbnailUrl: "", pageIndex: -1, documentName: "Tab Divider Back",
        section: item, isColor: true,
        label: item.label || undefined, color: item.color || undefined,
      });
    } else if (item.section_type === "insert") {
      const insertColor = item.color || "white";
      result.push({
        thumbnailUrl: "", pageIndex: 0, documentName: "Insert Sheet",
        section: item, isColor: true, color: insertColor,
      });
      result.push({
        thumbnailUrl: "", pageIndex: -1, documentName: "Insert Sheet Back",
        section: item, isColor: true, color: insertColor,
      });
    }
  };

  // Flush pending dividers only when the next slot is RIGHT (even index).
  // For non-bound (loose sheets), flush immediately — no spread constraint.
  const tryFlush = () => {
    if (pending.length === 0) return;
    if (!isBound || result.length % 2 === 0) {
      for (const item of pending) emitDivider(item);
      pending = [];
    }
  };

  for (const section of bodySections) {
    const doc = documents.find((d) => d.id === section.document_id);
    if (!doc) continue;
    const thumbnails = Array.isArray(doc.thumbnail_urls) ? (doc.thumbnail_urls as string[]) : [];
    const pageCount = doc.page_count ?? thumbnails.length;

    for (let i = 0; i < pageCount; i++) {
      pageNum++;

      // Before this body page, try flushing any pending dividers
      // (they may now land on a right-hand slot after the previous
      // page's blank_back shifted parity)
      tryFlush();

      // Push the body page
      result.push({
        thumbnailUrl: thumbnails[i] ?? "",
        pageIndex: i,
        documentName: doc.file_name,
        section,
        isColor: section.is_color,
      });

      // Simplex: push the natural reverse face of this sheet
      // (skip for booklets — saddle-stitched is always duplex)
      if (!section.is_duplex && !forceDuplex) {
        result.push({
          thumbnailUrl: "", pageIndex: -1, documentName: "",
          section, isColor: section.is_color,
        });
      }

      // Queue any dividers anchored after this page number
      const anchored = anchorMap.get(pageNum);
      if (anchored) {
        pending.push(...anchored);
      }

      // Try to flush immediately (if parity is already correct)
      tryFlush();
    }
  }

  // Flush anything still pending at the end of all body pages
  for (const item of pending) emitDivider(item);
  pending = [];

  return result;
}

export default function PreviewPanel({
  documents,
  sections,
  productType = "loose_sheets",
  effects,
  bindingEdge,
}: PreviewPanelProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const prevPageCount = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 500, height: 400 });

  const isBound = BOUND_TYPES.has(productType);
  const isFold = FOLD_TYPES.has(productType);
  const isRingBinder = productType === "ring_binder";
  const step = isBound ? 2 : 1;

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // For fold types, build outside/inside from assigned sections
  // Supports single-page, 2-page, and multi-panel (4/6-page) layouts
  const [composedFoldThumbnails, setComposedFoldThumbnails] = useState<string[] | null>(null);

  const foldSectionData = useMemo(() => {
    if (!isFold) return null;

    const outsideSection = sections.find((s) => s.section_type === "front_cover");
    const insideSection = sections.find((s) => s.section_type === "back_cover");

    if (!outsideSection && !insideSection) return { outside: null, inside: null, isMultiPanel: false };

    const getThumbsForSection = (section: DocumentSection | undefined): { urls: string[]; isMultiPanel: boolean } => {
      if (!section || !section.document_id) return { urls: [], isMultiPanel: false };
      const doc = documents.find((d) => d.id === section.document_id);
      if (!doc) return { urls: [], isMultiPanel: false };
      const thumbs = Array.isArray(doc.thumbnail_urls) ? (doc.thumbnail_urls as string[]) : [];

      const start = section.page_range_start ?? 0;
      const end = section.page_range_end;

      // Multi-panel: has both start and end, and they differ
      if (end != null && end !== start) {
        // Collect all pages in the assigned range
        const rangeUrls: string[] = [];
        for (let i = start; i <= end && i < thumbs.length; i++) {
          if (thumbs[i]) rangeUrls.push(thumbs[i]);
        }
        return { urls: rangeUrls, isMultiPanel: rangeUrls.length > 1 };
      }

      // Single page
      return { urls: thumbs[start] ? [thumbs[start]] : thumbs[0] ? [thumbs[0]] : [], isMultiPanel: false };
    };

    const outside = getThumbsForSection(outsideSection);
    const inside = getThumbsForSection(insideSection);
    const isMultiPanel = outside.isMultiPanel || inside.isMultiPanel;

    return { outside, inside, isMultiPanel };
  }, [documents, sections, isFold]);

  // Compose multi-panel thumbnails into single surface images
  useEffect(() => {
    if (!isFold || !foldSectionData) {
      setComposedFoldThumbnails(null);
      return;
    }

    const { outside, inside, isMultiPanel } = foldSectionData;
    if (!outside && !inside) {
      setComposedFoldThumbnails([]);
      return;
    }

    if (!isMultiPanel) {
      // Simple case: single URL per surface
      const result: string[] = [];
      if (outside?.urls[0]) result.push(outside.urls[0]);
      if (inside?.urls[0]) result.push(inside.urls[0]);
      setComposedFoldThumbnails(result.length > 0 ? result : []);
      return;
    }

    // Multi-panel: resolve storage keys → signed URLs, then compose via canvas
    let cancelled = false;
    (async () => {
      try {
        const result: string[] = [];
        if (outside && outside.urls.length > 0) {
          const resolved = await resolveUrls(outside.urls);
          if (cancelled) return;
          const composed = await composePanelImages(resolved);
          if (cancelled) return;
          result.push(composed);
        }
        if (inside && inside.urls.length > 0) {
          const resolved = await resolveUrls(inside.urls);
          if (cancelled) return;
          const composed = await composePanelImages(resolved);
          if (cancelled) return;
          result.push(composed);
        }
        if (!cancelled) setComposedFoldThumbnails(result.length > 0 ? result : []);
      } catch (err) {
        console.error("[brochure-preview] panel composition failed:", err);
        if (!cancelled) setComposedFoldThumbnails([]);
      }
    })();

    return () => { cancelled = true; };
  }, [isFold, foldSectionData]);

  const foldThumbnails = composedFoldThumbnails;

  // Build flat page list using anchor-based injection (only for non-fold types)
  const pages = useMemo(() => {
    if (isFold) return [];
    return buildPageSequence(sections, documents, isBound, productType);
  }, [sections, documents, isBound, isFold, productType]);

  // Build final page sequence with explicit roles + enforce physical alignment
  const { finalPages, pageRoles: computedPageRoles } = useMemo(() => {
    const fp = [...pages];
    const roles: string[] = fp.map((p) => {
      if (p.pageIndex === -1 && p.section?.section_type === "insert") return "insert_back";
      if (p.pageIndex === -1 && p.section?.section_type === "tab") return "tab_back";
      if (p.pageIndex === -1 && p.thumbnailUrl === "") return "blank_back";
      if (p.section?.section_type === "tab") return "tab";
      if (p.section?.section_type === "insert") return "insert";
      if (p.section?.section_type === "front_cover") return "front_cover";
      return "body";
    });

    // ── Physical PVC front cover ──
    // Only inject a PVC front sheet when the customer has explicitly chosen
    // a PVC cover option. Ring binders without an uploaded cover should NOT
    // get a fake PVC sheet built from the first body page — that produces
    // the "body page appears as cover" bug.
    const isPvcOption = effects?.frontCover && ["clear_pvc", "frosted_pvc", "matte_pvc"].includes(effects.frontCover);
    const isPvc = isBound && isPvcOption && fp.length > 0;
    if (isPvc && fp.length > 0) {
      const frontThumb = fp[0]?.thumbnailUrl ?? "";
      fp.unshift({ thumbnailUrl: frontThumb, pageIndex: 0, documentName: "PVC Cover", section: undefined, isColor: true });
      roles.unshift("pvc_cover_front");
      fp.splice(1, 0, { thumbnailUrl: "", pageIndex: 0, documentName: "PVC Cover Inside", section: undefined, isColor: true });
      roles.splice(1, 0, "pvc_cover_back");
    }

    // ── Ring binder physical model ──
    // The binder is hardware, NOT a printed cover. We do NOT inject any
    // virtual faces into the physical sequence. The viewer (RingBinderOpenSpread
    // + the navigation logic below) reconstructs the closed/open hardware
    // states at render time from view-index mapping.
    const isRingBinderType = productType === "ring_binder";

    // Tab/insert alignment is now handled inside buildPageSequence()
    // via the pending-queue flush — no post-processing pass needed.

    // ── Physical back cover card ──
    const hasBackCover = isBound && effects?.backCover && effects.backCover !== "none";
    // Ring binders are hardware — they have no printed back cover sheet.
    const skipBackCoverCard = isRingBinderType;
    if (isBound && !skipBackCoverCard) {
      if (hasBackCover) {
        if (fp.length % 2 !== 0) {
          fp.push({ thumbnailUrl: "", pageIndex: 0, documentName: "", section: undefined, isColor: true });
          roles.push("inside_back_blank");
        }
        fp.push({ thumbnailUrl: "", pageIndex: 0, documentName: "Back Cover Inside", section: undefined, isColor: true });
        roles.push("inside_back_cover_card");
        fp.push({ thumbnailUrl: "", pageIndex: 0, documentName: "Back Cover", section: undefined, isColor: true });
        roles.push("back_cover_card");
      } else {
        if (fp.length % 2 !== 0) {
          fp.push({ thumbnailUrl: "", pageIndex: 0, documentName: "", section: undefined, isColor: true });
          roles.push("inside_back_blank");
        }
      }
    }

    // ── Multicolor tab cycling: write cycled hex into each tab face's color ──
    // so PageEffects renders the sheet body in the same hue as the protrusion.
    const tabFaceIndices = roles
      .map((r, i) => (r === "tab" || r === "tab_back" ? i : -1))
      .filter((i) => i >= 0);
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

    return { finalPages: fp, pageRoles: roles };
  }, [pages, effects, isBound, productType]);

  const thumbnailPaths = useMemo(() => {
    if (isFold && foldThumbnails) return foldThumbnails;
    return finalPages.map((p) => p.thumbnailUrl);
  }, [finalPages, isFold, foldThumbnails]);
  const colorFlags = useMemo(() => finalPages.map((p) => p.isColor), [finalPages]);
  const sectionTypes = useMemo(() => finalPages.map((p) => p.section?.section_type ?? "body"), [finalPages]);
  const pageLabels = useMemo(() => finalPages.map((p) => p.label ?? ""), [finalPages]);
  const pageColors = useMemo(() => finalPages.map((p) => p.color ?? ""), [finalPages]);

  // Roles that do NOT get a content page number — they are material / blank faces
  const NON_CONTENT_ROLES = new Set([
    "tab", "tab_back", "insert", "insert_back", "blank_back",
    "pvc_cover_front", "pvc_cover_back",
    "inside_back_cover_card", "back_cover_card", "inside_back_blank",
  ]);

  // Compute display page numbers — only body/cover content faces get numbered.
  // Non-content faces (tabs, inserts, blank backs, material covers) get null.
  const displayPageNumbers = useMemo(() => {
    let num = 0;
    return computedPageRoles.map((role) => {
      if (NON_CONTENT_ROLES.has(role)) return null;
      num++;
      return num;
    });
  }, [computedPageRoles]);

  // Total content pages (for "of N" display)
  const totalContentPages = useMemo(
    () => displayPageNumbers.filter((n) => n !== null).length,
    [displayPageNumbers],
  );

  // Compute tab positions for persistent overlay
  const tabPositions = useMemo((): TabPosition[] => {
    const positions: TabPosition[] = [];
    const tabRoleIndices = computedPageRoles
      .map((r, i) => (r === "tab" ? i : -1))
      .filter((i) => i >= 0);
    const tabTotal = tabRoleIndices.length;
    tabRoleIndices.forEach((pageIdx, tabIdx) => {
      const page = finalPages[pageIdx];
      positions.push({
        pageIndex: pageIdx,
        label: page?.label || `Tab ${tabIdx + 1}`,
        tabIndex: tabIdx,
        tabTotal,
        color: page?.color || "",
      });
    });
    return positions;
  }, [computedPageRoles, finalPages]);

  const isBusinessCards = productType === "business_cards";

  const bleedFlags = useMemo(() => {
    // Business cards: server thumbnails are already trim-cropped — always full bleed
    if (isBusinessCards) return computedPageRoles.map(() => true);
    const bleedScope = effects?.bleed ?? "none";
    return computedPageRoles.map((role) => {
      if (["pvc_cover_front", "pvc_cover_back", "inside_back_cover_card", "back_cover_card"].includes(role)) return true;
      if (["blank_back", "inside_back_blank"].includes(role)) return false;
      // Ring binder body pages sit inside a mechanism — never edge-to-edge.
      // Only PVC/card cover materials (handled above) get full bleed.
      if (isRingBinder && role === "body") return false;
      if (bleedScope === "all") return true;
      if (bleedScope === "none") return false;
      if (bleedScope === "front_cover" && role === "front_cover") return true;
      if (bleedScope === "covers" && (role === "front_cover" || role === "back_cover")) return true;
      return false;
    });
  }, [computedPageRoles, effects?.bleed, isBusinessCards, isRingBinder]);

  const pageAspectRatio = useMemo(() => {
    const doc = documents.find((d) => d.page_width_mm && d.page_height_mm);
    if (doc && doc.page_width_mm && doc.page_height_mm) {
      return Number(doc.page_width_mm) / Number(doc.page_height_mm);
    }
    // Business cards fallback: standard 90×50mm = 1.8
    if (isBusinessCards) return 1.8;
    return undefined;
  }, [documents, isBusinessCards]);

  // For ring binders, navigation uses the shared sheet-flip view model:
  //   view 0   = closed (hardware only)
  //   view 1   = left=hardware, right=seq[0]
  //   view k≥2 = left=seq[2k-3], right=seq[2k-2]
  //   final    = left=seq[N-1], right=hardware
  const ringTotal = isRingBinder ? ringTotalViews(finalPages.length) : 0;
  const totalPages = isRingBinder ? ringTotal : finalPages.length;

  useEffect(() => {
    if (prevPageCount.current !== 0 && totalPages > 0 && currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
    prevPageCount.current = totalPages;
  }, [totalPages, currentPage]);

  // hasRealFrontCover is derived from real role data — true only when the
  // first face is an actual front cover (uploaded artwork) or a PVC cover sheet.
  const firstRole = computedPageRoles[0];
  const realFrontCover = firstRole === "front_cover" || firstRole === "pvc_cover_front";
  const hasRealFrontCover = realFrontCover;
  // Structural solo-state: every bound doc opens with page 1 solo on the right.
  // hasRealFrontCover is used ONLY for labels, never for layout decisions.
  // Ring binder uses static rendering — its component handles left/right internally,
  // so we treat it like a non-bound type for pagination/solo-state purposes.
  const isShowingFrontCover = isBound && !isRingBinder && currentPage === 0;
  const hasBackCoverCard = computedPageRoles.includes("back_cover_card");
  const isShowingBackCover = isBound && !isRingBinder && hasBackCoverCard && currentPage >= totalPages - 1;
  const isShowingLastSolo = isBound && !isRingBinder && !hasBackCoverCard && currentPage >= totalPages - 1;
  const isSoloState = isRingBinder ? false : (isShowingFrontCover || isShowingBackCover || isShowingLastSolo);

  // Ring binder: derive visible faces from the shared view model.
  const ringView = isRingBinder ? resolveRingView(currentPage, finalPages.length) : null;
  const ringLeftFace = ringView && ringView.left.kind === "sheet" ? ringView.left.faceIndex : null;
  const ringRightFace = ringView && ringView.right.kind === "sheet" ? ringView.right.faceIndex : null;

  const visibleLeft = isRingBinder
    ? ringLeftFace
    : (isSoloState && isShowingFrontCover ? null : currentPage);
  const visibleRight = isRingBinder
    ? ringRightFace
    : (isShowingFrontCover ? 0 : (isSoloState ? null : currentPage + 1));

  /** Human-friendly label for a role when it has no page number */
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

  const faceLabel = (idx: number): string => {
    const dpn = displayPageNumbers[idx];
    if (dpn !== null) return `Page ${dpn}`;
    return roleFriendlyName(computedPageRoles[idx]);
  };

  const pageInfoText = useMemo(() => {
    if (totalPages === 0) return "";
    if (isBound) {
      // Ring binder uses sheet-flip view-index navigation. Hardware panes
      // are not pages and never get a label — show only the visible faces.
      if (isRingBinder) {
        if (currentPage === 0) return "Ring Binder (Closed)";
        const leftLbl = ringLeftFace !== null ? faceLabel(ringLeftFace) : "";
        const rightLbl = ringRightFace !== null ? faceLabel(ringRightFace) : "";
        const suffix = totalContentPages > 0 ? `  (${totalContentPages} pages)` : "";
        if (leftLbl && rightLbl) return `${leftLbl} – ${rightLbl}${suffix}`;
        if (rightLbl) return `${rightLbl}${suffix}`;
        if (leftLbl) return `${leftLbl}${suffix}`;
        return "Ring Binder";
      }
      if (isShowingFrontCover) {
        if (!hasRealFrontCover) return faceLabel(0);
        const role = computedPageRoles[0];
        return role === "pvc_cover_front" ? "Front Cover (PVC)" : "Front Cover";
      }
      if (isShowingBackCover) return "Back Cover";
      if (isShowingLastSolo) {
        return `${faceLabel(totalPages - 1)} of ${totalContentPages}`;
      }
      const leftLabel = faceLabel(currentPage);
      const rightLabel = faceLabel(currentPage + 1);
      return `${leftLabel} – ${rightLabel}  (${totalContentPages} pages)`;
    }
    return `${faceLabel(currentPage)} of ${totalContentPages}`;
  }, [currentPage, totalPages, totalContentPages, isBound, isRingBinder, ringLeftFace, ringRightFace, isShowingFrontCover, isShowingBackCover, isShowingLastSolo, computedPageRoles, displayPageNumbers, hasRealFrontCover]);

  const colourStatus = useMemo(() => {
    if (totalPages === 0) return "";
    const visibleIndices: number[] = [];
    if (visibleLeft !== null) visibleIndices.push(visibleLeft);
    if (visibleRight !== null && visibleRight < totalPages) visibleIndices.push(visibleRight);
    if (visibleIndices.length === 0) return "";
    const allColor = visibleIndices.every((i) => finalPages[i]?.isColor);
    const allBW = visibleIndices.every((i) => !finalPages[i]?.isColor);
    return allColor ? "Colour" : allBW ? "B&W" : "Mixed";
  }, [visibleLeft, visibleRight, finalPages, totalPages]);

  const duplexStatus = useMemo(() => {
    if (totalPages === 0) return "";
    const idx = visibleLeft ?? visibleRight ?? 0;
    const sec = finalPages[idx]?.section;
    return sec?.is_duplex ? "Duplex" : "Simplex";
  }, [visibleLeft, visibleRight, finalPages, totalPages]);

  const sectionLabel = useMemo(() => {
    if (totalPages === 0) return "";
    const idx = visibleLeft ?? visibleRight ?? 0;
    const sec = finalPages[idx]?.section;
    return sec ? (SECTION_LABELS[sec.section_type] ?? sec.section_type) : "";
  }, [visibleLeft, visibleRight, finalPages, totalPages]);

  const goFirst = () => setCurrentPage(0);
  const goLast = () => setCurrentPage(totalPages - 1);
  const goPrev = () => setCurrentPage((p) => {
    if (isRingBinder) return stepRingView(p, finalPages.length, -1);
    return Math.max(0, p - step);
  });
  const goNext = () => setCurrentPage((p) => {
    if (isRingBinder) return stepRingView(p, finalPages.length, 1);
    return Math.min(totalPages - 1, p + step);
  });

  if (totalPages === 0 && (!foldThumbnails || foldThumbnails.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
        <FileText className="h-16 w-16 opacity-20 mb-4" />
        <p className="text-lg font-medium">No pages to preview</p>
        <p className="text-sm mt-1">Add files as sections to see a preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 h-full">
      <div ref={containerRef} className="relative flex-1 flex items-center justify-center w-full overflow-hidden">
        <button
          onClick={() => setLightboxOpen(true)}
          className="absolute top-2 right-2 z-10 h-8 w-8 flex items-center justify-center rounded-md bg-background/80 hover:bg-background text-foreground shadow-sm border border-border transition-colors"
          title="Fullscreen preview"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <DocumentPreview
          thumbnailPaths={thumbnailPaths}
          productType={productType}
          width={containerSize.width}
          height={containerSize.height}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          colorFlags={colorFlags}
          pageAspectRatio={pageAspectRatio}
          effects={effects}
          sectionTypes={sectionTypes}
          pageRoles={computedPageRoles}
          bleedFlags={bleedFlags}
          pageLabels={pageLabels}
          pageColors={pageColors}
          tabPositions={tabPositions}
          displayPageNumbers={displayPageNumbers}
          faceLabels={computedPageRoles.map((_, i) => faceLabel(i))}
          bindingEdge={bindingEdge}
        />
      </div>

      {lightboxOpen && (
        <PreviewLightbox
          thumbnailPaths={thumbnailPaths}
          initialPage={currentPage}
          productType={productType}
          onClose={(p) => { setCurrentPage(p); setLightboxOpen(false); }}
          colorFlags={colorFlags}
          pageAspectRatio={pageAspectRatio}
          effects={effects}
          sectionTypes={sectionTypes}
          pageRoles={computedPageRoles}
          bleedFlags={bleedFlags}
          pageLabels={pageLabels}
          pageColors={pageColors}
          tabPositions={tabPositions}
          displayPageNumbers={displayPageNumbers}
          bindingEdge={bindingEdge}
        />
      )}

      {!isFold && (
        <>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{pageInfoText}</p>
            {sectionLabel && (
              <div className="flex items-center justify-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">{sectionLabel}</Badge>
                <span className="text-xs text-muted-foreground">{colourStatus} · {duplexStatus}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full max-w-md">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={currentPage === 0} onClick={goFirst}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={currentPage === 0} onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Slider value={[currentPage]} min={0} max={Math.max(0, totalPages - 1)} step={1} onValueChange={([v]) => setCurrentPage(v)} className="flex-1" />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={currentPage >= totalPages - 1} onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={currentPage >= totalPages - 1} onClick={goLast}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
