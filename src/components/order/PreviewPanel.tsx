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
import type { ProductPreviewType } from "@/components/preview/previewTypes";

type Document = Tables<"documents">;
type DocumentSection = Tables<"document_sections">;

interface PreviewPanelProps {
  documents: Document[];
  sections: DocumentSection[];
  productType?: ProductPreviewType;
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

export default function PreviewPanel({
  documents,
  sections,
  productType = "loose_sheets",
}: PreviewPanelProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 500, height: 400 });

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

  const thumbnailPaths = useMemo(
    () => pages.map((p) => p.thumbnailUrl).filter(Boolean),
    [pages]
  );

  const totalPages = pages.length;
  const page = pages[currentPage];

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
      <div ref={containerRef} className="flex-1 flex items-center justify-center w-full">
        <DocumentPreview
          thumbnailPaths={thumbnailPaths}
          productType={productType}
          width={containerSize.width}
          height={containerSize.height}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Page info */}
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          Page {currentPage + 1} of {totalPages}
        </p>
        {page?.section && (
          <div className="flex items-center justify-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">
              {SECTION_LABELS[page.section.section_type] ?? page.section.section_type}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {page.isColor ? "Colour" : "B&W"}
              {" · "}
              {page.section.is_duplex ? "Duplex" : "Simplex"}
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2 w-full max-w-md">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={currentPage === 0} onClick={() => setCurrentPage(0)}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={currentPage === 0} onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Slider value={[currentPage]} min={0} max={Math.max(0, totalPages - 1)} step={1} onValueChange={([v]) => setCurrentPage(v)} className="flex-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
