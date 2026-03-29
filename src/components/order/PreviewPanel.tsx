import { useState, useMemo, useRef, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FileText,
} from "lucide-react";
import DocumentPreview from "@/components/preview/DocumentPreview";
import type { ProductPreviewType, PreviewEffects, TabPosition } from "@/components/preview/previewTypes";

type Document = Tables<"documents">;
type DocumentSection = Tables<"document_sections">;

interface PreviewPanelProps {
  documents: Document[];
  sections: DocumentSection[];
  productType?: ProductPreviewType;
  effects?: PreviewEffects;
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
function buildPageSequence(sections: DocumentSection[], documents: Document[]): PageInfo[] {
  // Separate body sections from anchored items
  const bodySections = sections.filter(
    (s) => s.section_type !== "tab" && s.section_type !== "insert"
  );
  const anchoredSections = sections.filter(
    (s) => s.section_type === "tab" || s.section_type === "insert"
  );

  // Determine if any body section is duplex
  const isDuplex = bodySections.some((s) => s.is_duplex);

  // Build anchor map, snapping to valid sheet boundaries
  const anchorMap = new Map<number, DocumentSection[]>();
  for (const s of anchoredSections) {
    let anchor = s.page_range_start ?? 0;
    // In duplex mode, snap odd anchors to next even page (sheet boundary)
    if (isDuplex && anchor > 0 && anchor % 2 !== 0) {
      anchor = anchor + 1;
    }
    const list = anchorMap.get(anchor) || [];
    list.push(s);
    anchorMap.set(anchor, list);
  }

  const result: PageInfo[] = [];
  let pageNum = 0;

  for (const section of bodySections) {
    const doc = documents.find((d) => d.id === section.document_id);
    if (!doc) continue;
    const thumbnails = Array.isArray(doc.thumbnail_urls) ? (doc.thumbnail_urls as string[]) : [];
    const pageCount = doc.page_count ?? thumbnails.length;

    for (let i = 0; i < pageCount; i++) {
      pageNum++;
      // Push the body page
      result.push({
        thumbnailUrl: thumbnails[i] ?? "",
        pageIndex: i,
        documentName: doc.file_name,
        section,
        isColor: section.is_color,
      });
      // Simplex: push the natural reverse face of this sheet.
      // This MUST come before any anchored items so the physical
      // sheet is complete before a new sheet (tab/insert) begins.
      if (!section.is_duplex) {
        result.push({
          thumbnailUrl: "",
          pageIndex: -1,
          documentName: "",
          section,
          isColor: section.is_color,
        });
      }
      // Now the physical sheet is complete — inject any tabs/inserts
      // anchored "after page N". They start a new physical sheet.
      const anchored = anchorMap.get(pageNum);
      if (anchored) {
        for (const item of anchored) {
          if (item.section_type === "tab") {
            // Front face of tab divider
            result.push({
              thumbnailUrl: "",
              pageIndex: 0,
              documentName: "Tab Divider",
              section: item,
              isColor: true,
              label: item.label || undefined,
              color: item.color || undefined,
            });
            // Back face of tab divider (physical sheet)
            result.push({
              thumbnailUrl: "",
              pageIndex: -1,
              documentName: "Tab Divider Back",
              section: item,
              isColor: true,
              label: item.label || undefined,
              color: item.color || undefined,
            });
          } else if (item.section_type === "insert") {
            const insertColor = item.color || "white";
            // Front face
            result.push({
              thumbnailUrl: "",
              pageIndex: 0,
              documentName: "Insert Sheet",
              section: item,
              isColor: true,
              color: insertColor,
            });
            // Back face (physical sheet)
            result.push({
              thumbnailUrl: "",
              pageIndex: -1,
              documentName: "Insert Sheet Back",
              section: item,
              isColor: true,
              color: insertColor,
            });
          }
        }
      }
    }
  }

  return result;
}

export default function PreviewPanel({
  documents,
  sections,
  productType = "loose_sheets",
  effects,
}: PreviewPanelProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const prevPageCount = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 500, height: 400 });

  const isBound = BOUND_TYPES.has(productType);
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

  // Build flat page list using anchor-based injection
  const pages = useMemo(() => buildPageSequence(sections, documents), [sections, documents]);

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
    const isPvc = isBound && effects?.frontCover && ["clear_pvc", "frosted_pvc", "matte_pvc"].includes(effects.frontCover);
    if (isPvc && fp.length > 0) {
      const frontThumb = fp[0]?.thumbnailUrl ?? "";
      fp.unshift({ thumbnailUrl: frontThumb, pageIndex: 0, documentName: "PVC Cover", section: undefined, isColor: true });
      roles.unshift("pvc_cover_front");
      fp.splice(1, 0, { thumbnailUrl: "", pageIndex: 0, documentName: "PVC Cover Inside", section: undefined, isColor: true });
      roles.splice(1, 0, "pvc_cover_back");
    }

    // ── Physical back cover card ──
    const hasBackCover = isBound && effects?.backCover && effects.backCover !== "none";
    if (isBound) {
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

    return { finalPages: fp, pageRoles: roles };
  }, [pages, effects, isBound]);

  const thumbnailPaths = useMemo(() => finalPages.map((p) => p.thumbnailUrl), [finalPages]);
  const colorFlags = useMemo(() => finalPages.map((p) => p.isColor), [finalPages]);
  const sectionTypes = useMemo(() => finalPages.map((p) => p.section?.section_type ?? "body"), [finalPages]);
  const pageLabels = useMemo(() => finalPages.map((p) => p.label ?? ""), [finalPages]);
  const pageColors = useMemo(() => finalPages.map((p) => p.color ?? ""), [finalPages]);

  // Compute display page numbers — sequential 1-based labels for the physical face sequence
  const displayPageNumbers = useMemo(() => {
    let num = 0;
    return finalPages.map((_, i) => {
      num++;
      return num;
    });
  }, [finalPages]);

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

  const bleedFlags = useMemo(() => {
    const bleedScope = effects?.bleed ?? "none";
    return computedPageRoles.map((role) => {
      if (["pvc_cover_front", "pvc_cover_back", "inside_back_cover_card", "back_cover_card"].includes(role)) return true;
      if (["blank_back", "inside_back_blank"].includes(role)) return false;
      if (bleedScope === "all") return true;
      if (bleedScope === "none") return false;
      if (bleedScope === "front_cover" && role === "front_cover") return true;
      if (bleedScope === "covers" && (role === "front_cover" || role === "back_cover")) return true;
      return false;
    });
  }, [computedPageRoles, effects?.bleed]);

  const pageAspectRatio = useMemo(() => {
    const doc = documents.find((d) => d.page_width_mm && d.page_height_mm);
    if (doc && doc.page_width_mm && doc.page_height_mm) {
      return Number(doc.page_width_mm) / Number(doc.page_height_mm);
    }
    return undefined;
  }, [documents]);

  const totalPages = finalPages.length;

  useEffect(() => {
    if (prevPageCount.current !== 0 && totalPages > 0 && currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
    prevPageCount.current = totalPages;
  }, [totalPages, currentPage]);

  const isShowingFrontCover = isBound && currentPage === 0;
  const hasBackCoverCard = computedPageRoles.includes("back_cover_card");
  const isShowingBackCover = isBound && hasBackCoverCard && currentPage >= totalPages - 1;
  const isShowingLastSolo = isBound && !hasBackCoverCard && currentPage >= totalPages - 1;
  const isSoloState = isShowingFrontCover || isShowingBackCover || isShowingLastSolo;

  const visibleLeft = isSoloState && isShowingFrontCover ? null : currentPage;
  const visibleRight = isShowingFrontCover ? 0 : (isSoloState ? null : currentPage + 1);

  const pageInfoText = useMemo(() => {
    if (totalPages === 0) return "";
    if (isBound) {
      if (isShowingFrontCover) {
        const role = computedPageRoles[0];
        return role === "pvc_cover_front" ? "Front Cover (PVC)" : "Front Cover";
      }
      if (isShowingBackCover) return "Back Cover";
      if (isShowingLastSolo) {
        const dpn = displayPageNumbers[totalPages - 1] ?? totalPages;
        return `Page ${dpn} of ${displayPageNumbers[totalPages - 1] ?? totalPages}`;
      }
      const leftNum = displayPageNumbers[currentPage] ?? (currentPage + 1);
      const rightNum = displayPageNumbers[currentPage + 1] ?? (currentPage + 2);
      return `Pages ${leftNum}–${rightNum}  (${displayPageNumbers[totalPages - 1] ?? totalPages} pages)`;
    }
    const dpn = displayPageNumbers[currentPage] ?? (currentPage + 1);
    return `Page ${dpn} of ${displayPageNumbers[totalPages - 1] ?? totalPages}`;
  }, [currentPage, totalPages, isBound, isShowingFrontCover, isShowingBackCover, isShowingLastSolo, computedPageRoles, displayPageNumbers]);

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
  const goPrev = () => setCurrentPage((p) => Math.max(0, p - step));
  const goNext = () => setCurrentPage((p) => Math.min(totalPages - 1, p + step));

  if (totalPages === 0) {
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
      <div ref={containerRef} className="flex-1 flex items-center justify-center w-full overflow-hidden">
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
        />
      </div>

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
    </div>
  );
}
