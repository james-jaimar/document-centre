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
      if (section.section_type === "tab") {
        result.push({
          thumbnailUrl: "",
          pageIndex: 0,
          documentName: "Tab Divider",
          section,
          isColor: true,
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
      }
    }
    return result;
  }, [documents, sections]);

  // Build final page sequence with explicit roles
  const { finalPages, pageRoles: computedPageRoles } = useMemo(() => {
    const fp = [...pages];
    const roles: string[] = fp.map((p, i) => {
      if (i === 0 && isBound) return "front_cover";
      if (p.section?.section_type === "tab") return "body";
      return "body";
    });

    // For bound documents with showCover, the library treats the first AND last
    // page as solo covers. We need the total page count (excluding any back cover
    // card we'll append) to be even so that interior spreads pair correctly.
    //
    // The total sequence for showCover must have an EVEN number of pages:
    //   - Page 0 = front cover (solo, right side)
    //   - Pages 1..N-2 = interior spreads (pairs)
    //   - Page N-1 = back cover (solo, left side)
    //
    // So if we have back cover card: total must be even (front + interior + back)
    // If no back cover card: total must be even (front + interior, last interior is solo)
    
    const hasBackCover = isBound && effects?.backCover && effects.backCover !== "none";
    
    if (isBound) {
      // Current count without back cover
      const currentCount = fp.length;
      
      if (hasBackCover) {
        // We'll append a back cover card. For showCover to work correctly,
        // the total (currentCount + 1 for back cover) must be even.
        // If currentCount is odd, total will be even — good.
        // If currentCount is even, total will be odd — need to insert an inside-back blank.
        if (currentCount % 2 === 0) {
          fp.push({
            thumbnailUrl: "",
            pageIndex: 0,
            documentName: "",
            section: undefined,
            isColor: true,
          });
          roles.push("inside_back_blank");
        }
        // Append the back cover card as the final page
        fp.push({
          thumbnailUrl: "",
          pageIndex: 0,
          documentName: "Back Cover",
          section: undefined,
          isColor: true,
        });
        roles.push("back_cover_card");
      } else {
        // No back cover card. The last page in the sequence will be treated
        // as a solo cover by showCover. Total must be even.
        if (currentCount % 2 !== 0) {
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
  }, [pages, effects?.backCover, isBound]);

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

  // Derive aspect ratio from the first document's actual dimensions
  const pageAspectRatio = useMemo(() => {
    const doc = documents.find((d) => d.page_width_mm && d.page_height_mm);
    if (doc && doc.page_width_mm && doc.page_height_mm) {
      return Number(doc.page_width_mm) / Number(doc.page_height_mm);
    }
    return undefined;
  }, [documents]);

  const totalPages = finalPages.length;

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
    if (isBound) {
      if (isShowingFrontCover) return `Page 1 of ${totalPages}`;
      if (isShowingBackCover) {
        return hasBackCoverCard ? `Back Cover` : `Page ${totalPages} of ${totalPages}`;
      }
      if (isShowingLastSolo) return `Page ${totalPages} of ${totalPages}`;
      const left = currentPage + 1;
      const right = Math.min(currentPage + 2, totalPages);
      return left === right
        ? `Page ${left} of ${totalPages}`
        : `Pages ${left}–${right} of ${totalPages}`;
    }
    return `Page ${currentPage + 1} of ${totalPages}`;
  }, [currentPage, totalPages, isBound, isShowingFrontCover, isShowingBackCover, isShowingLastSolo, hasBackCoverCard]);

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
