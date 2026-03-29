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
import type { ProductPreviewType, PreviewEffects } from "@/components/preview/previewTypes";

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

  // Build flat page list from sections + documents
  const pages = useMemo(() => {
    const result: PageInfo[] = [];
    for (const section of sections) {
      // Tab dividers — no document, just a placeholder page
      if (section.section_type === "tab") {
        result.push({
          thumbnailUrl: "",
          pageIndex: 0,
          documentName: "Tab Divider",
          section,
          isColor: true,
          label: (section as any).label || undefined,
        });
        continue;
      }
      // Insert sheets — no document, blank colored divider page
      if (section.section_type === "insert") {
        result.push({
          thumbnailUrl: "",
          pageIndex: 0,
          documentName: "Insert Sheet",
          section,
          isColor: true,
          color: (section as any).color || "white",
        });
        continue;
      }
      const doc = documents.find((d) => d.id === section.document_id);
      if (!doc) continue;
      const thumbnails = Array.isArray(doc.thumbnail_urls)
        ? (doc.thumbnail_urls as string[])
        : [];
      const pageCount = doc.page_count ?? thumbnails.length;
      for (let i = 0; i < pageCount; i++) {
        result.push({
          thumbnailUrl: thumbnails[i] ?? "",
          pageIndex: i,
          documentName: doc.file_name,
          section,
          isColor: section.is_color,
        });
        // Simplex: insert blank back for each printed page
        if (!section.is_duplex) {
          result.push({
            thumbnailUrl: "",
            pageIndex: -1,
            documentName: "",
            section,
            isColor: section.is_color,
          });
        }
      }
    }
    return result;
  }, [documents, sections]);

  // Build final page sequence with explicit roles
  const { finalPages, pageRoles: computedPageRoles } = useMemo(() => {
    const fp = [...pages];
    const roles: string[] = fp.map((p, i) => {
      // Simplex blank backs inserted with pageIndex -1
      if (p.pageIndex === -1 && p.thumbnailUrl === "") return "blank_back";
      if (i === 0 && isBound && p.section?.section_type === "front_cover") return "front_cover";
      if (p.section?.section_type === "tab") return "body";
      if (p.section?.section_type === "insert") return "insert";
      return "body";
    });

    // ── Physical PVC front cover: TWO faces (outside + inside) ──
    const isPvc = isBound && effects?.frontCover && ["clear_pvc", "frosted_pvc", "matte_pvc"].includes(effects.frontCover);
    if (isPvc && fp.length > 0) {
      const frontThumb = fp[0]?.thumbnailUrl ?? "";
      // Outside face: artwork with PVC overlay (solo cover when closed)
      fp.unshift({
        thumbnailUrl: frontThumb,
        pageIndex: 0,
        documentName: "PVC Cover",
        section: undefined,
        isColor: true,
      });
      roles.unshift("pvc_cover_front");
      // Inside face: translucent reverse of the PVC sheet (left page when opened)
      fp.splice(1, 0, {
        thumbnailUrl: "",
        pageIndex: 0,
        documentName: "PVC Cover Inside",
        section: undefined,
        isColor: true,
      });
      roles.splice(1, 0, "pvc_cover_back");
    }

    // ── Physical back cover card: TWO faces (inside + outside) ──
    const hasBackCover = isBound && effects?.backCover && effects.backCover !== "none";

    if (isBound) {
      if (hasBackCover) {
        // Ensure even count BEFORE adding the two card faces.
        // After adding inside + outside, total must be even for react-pageflip.
        // inside_back_cover_card = right page of last spread, back_cover_card = solo final.
        // Adding 2 pages: if current count is odd, we need one blank to make it even before
        // the pair, resulting in odd+1+2 = even. If even, just add 2 = even.
        if (fp.length % 2 !== 0) {
          fp.push({
            thumbnailUrl: "",
            pageIndex: 0,
            documentName: "",
            section: undefined,
            isColor: true,
          });
          roles.push("inside_back_blank");
        }
        // Inside face of card (right side of last spread)
        fp.push({
          thumbnailUrl: "",
          pageIndex: 0,
          documentName: "Back Cover Inside",
          section: undefined,
          isColor: true,
        });
        roles.push("inside_back_cover_card");
        // Outside face of card (solo back cover)
        fp.push({
          thumbnailUrl: "",
          pageIndex: 0,
          documentName: "Back Cover",
          section: undefined,
          isColor: true,
        });
        roles.push("back_cover_card");
      } else {
        // No card back: just ensure even page count
        if (fp.length % 2 !== 0) {
          fp.push({
            thumbnailUrl: "",
            pageIndex: 0,
            documentName: "",
            section: undefined,
            isColor: true,
          });
          roles.push("inside_back_blank");
        }
      }
    }

    return { finalPages: fp, pageRoles: roles };
  }, [pages, effects, isBound]);

  const thumbnailPaths = useMemo(
    () => finalPages.map((p) => p.thumbnailUrl),
    [finalPages]
  );

  const colorFlags = useMemo(
    () => finalPages.map((p) => p.isColor),
    [finalPages]
  );

  const sectionTypes = useMemo(
    () => finalPages.map((p) => p.section?.section_type ?? "body"),
    [finalPages]
  );

  // Compute explicit bleed flags per physical face (once, upstream)
  const bleedFlags = useMemo(() => {
    const bleedScope = effects?.bleed ?? "none";
    return computedPageRoles.map((role) => {
      // Non-paper surfaces: PVC, card — never use paper margin logic
      if (["pvc_cover_front", "pvc_cover_back", "inside_back_cover_card", "back_cover_card"].includes(role)) {
        return true; // edge-to-edge, no white inset
      }
      // Blank pages: always show paper with margin (no bleed)
      if (["blank_back", "inside_back_blank"].includes(role)) {
        return false;
      }
      // Printed pages: depends on bleed scope
      if (bleedScope === "all") return true;
      if (bleedScope === "none") return false;
      if (bleedScope === "front_cover" && role === "front_cover") return true;
      if (bleedScope === "covers" && (role === "front_cover" || role === "back_cover")) return true;
      return false;
    });
  }, [computedPageRoles, effects?.bleed]);

  // Derive aspect ratio from the first document's actual dimensions
  const pageAspectRatio = useMemo(() => {
    const doc = documents.find((d) => d.page_width_mm && d.page_height_mm);
    if (doc && doc.page_width_mm && doc.page_height_mm) {
      return Number(doc.page_width_mm) / Number(doc.page_height_mm);
    }
    return undefined;
  }, [documents]);

  const totalPages = finalPages.length;

  // Clamp currentPage when page count changes (e.g. cover options added/removed)
  useEffect(() => {
    if (prevPageCount.current !== 0 && totalPages > 0 && currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
    prevPageCount.current = totalPages;
  }, [totalPages, currentPage]);

  // Derive what's visible in the current spread
  const isShowingFrontCover = isBound && currentPage === 0;
  const hasBackCoverCard = computedPageRoles.includes("back_cover_card");
  const isShowingBackCover = isBound && hasBackCoverCard && currentPage >= totalPages - 1;
  // Also solo when showing the last page without back cover card (library treats last as solo)
  const isShowingLastSolo = isBound && !hasBackCoverCard && currentPage >= totalPages - 1;

  const isSoloState = isShowingFrontCover || isShowingBackCover || isShowingLastSolo;

  const visibleLeft = isSoloState && isShowingFrontCover ? null : currentPage;
  const visibleRight = isShowingFrontCover ? 0 : (isSoloState ? null : currentPage + 1);

  // Page info text
  const pageInfoText = useMemo(() => {
    if (totalPages === 0) return "";
    // Use roles for descriptive labels
    const leftRole = visibleLeft !== null ? computedPageRoles[visibleLeft] : null;
    const rightRole = visibleRight !== null && visibleRight < totalPages ? computedPageRoles[visibleRight] : null;

    if (isBound) {
      if (isShowingFrontCover) {
        const role = computedPageRoles[0];
        if (role === "pvc_cover_front") return "Front Cover (PVC)";
        return "Front Cover";
      }
      if (isShowingBackCover) return "Back Cover";
      if (isShowingLastSolo) return `Page ${totalPages} of ${totalPages}`;

      // Build labels for left/right
      const labels: string[] = [];
      if (leftRole === "pvc_cover_back") labels.push("PVC Inside");
      else if (leftRole === "blank_back") labels.push("Blank");
      else if (leftRole === "inside_back_blank") labels.push("Blank");
      else if (leftRole === "inside_back_cover_card") labels.push("Back Cover Inside");
      else if (leftRole) labels.push(`Page ${currentPage + 1}`);

      if (rightRole === "front_cover") labels.push("Front Cover");
      else if (rightRole === "blank_back") labels.push("Blank");
      else if (rightRole === "inside_back_blank") labels.push("Blank");
      else if (rightRole === "inside_back_cover_card") labels.push("Back Cover Inside");
      else if (rightRole) labels.push(`Page ${currentPage + 2}`);

      return labels.length > 0 ? `${labels.join(" · ")}  (${totalPages} pages)` : `Page ${currentPage + 1} of ${totalPages}`;
    }
    return `Page ${currentPage + 1} of ${totalPages}`;
  }, [currentPage, totalPages, isBound, isShowingFrontCover, isShowingBackCover, isShowingLastSolo, hasBackCoverCard, computedPageRoles, visibleLeft, visibleRight]);

  // Colour status for visible pages
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

  // Duplex status for visible pages
  const duplexStatus = useMemo(() => {
    if (totalPages === 0) return "";
    const idx = visibleLeft ?? visibleRight ?? 0;
    const sec = finalPages[idx]?.section;
    return sec?.is_duplex ? "Duplex" : "Simplex";
  }, [visibleLeft, visibleRight, finalPages, totalPages]);

  // Section label for visible pages
  const sectionLabel = useMemo(() => {
    if (totalPages === 0) return "";
    const idx = visibleLeft ?? visibleRight ?? 0;
    const sec = finalPages[idx]?.section;
    return sec ? (SECTION_LABELS[sec.section_type] ?? sec.section_type) : "";
  }, [visibleLeft, visibleRight, finalPages, totalPages]);

  // Navigation helpers
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
      {/* Preview display */}
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
        />
      </div>

      {/* Page info */}
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{pageInfoText}</p>
        {sectionLabel && (
          <div className="flex items-center justify-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              {sectionLabel}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {colourStatus}
              {" · "}
              {duplexStatus}
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
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
