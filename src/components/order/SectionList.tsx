import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Palette,
  PaintBucket,
  FlipHorizontal,
  FlipVertical,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

type DocumentSection = Tables<"document_sections">;
type Document = Tables<"documents">;

const SECTION_LABELS: Record<string, string> = {
  front_cover: "Front Cover",
  back_cover: "Back Cover",
  body: "Body Pages",
  insert: "Insert",
  tab: "Tab Divider",
};

interface SectionListProps {
  sections: DocumentSection[];
  documents: Document[];
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  onToggleColor: (section: DocumentSection) => void;
  onToggleDuplex: (section: DocumentSection) => void;
  onMove: (sectionId: string, direction: "up" | "down") => void;
}

export default function SectionList({
  sections,
  documents,
  selectedSectionId,
  onSelect,
  onToggleColor,
  onToggleDuplex,
  onMove,
}: SectionListProps) {
  const getDoc = (docId: string | null) =>
    documents.find((d) => d.id === docId);

  if (sections.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No sections yet</p>
        <p className="text-xs mt-1">
          Select a file and add it as a section
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sections.map((section, idx) => {
        const doc = getDoc(section.document_id);
        const pageCount = doc?.page_count ?? 0;

        return (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={cn(
              "rounded-lg border p-3 transition-all cursor-pointer",
              selectedSectionId === section.id
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:border-primary/30"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {SECTION_LABELS[section.section_type] ?? section.section_type}
                  </Badge>
                  {doc && (
                    <span className="text-xs text-muted-foreground truncate">
                      {doc.file_name}
                    </span>
                  )}
                </div>
                {pageCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {pageCount} {pageCount === 1 ? "page" : "pages"}
                  </p>
                )}
              </div>

              {/* Move buttons */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={idx === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(section.id, "up");
                  }}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={idx === sections.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(section.id, "down");
                  }}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Per-section controls */}
            <div className="flex items-center gap-1 mt-2">
              <Button
                variant={section.is_color ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1.5 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleColor(section);
                }}
              >
                <Palette className="h-3 w-3" />
                {section.is_color ? "Colour" : "B&W"}
              </Button>
              <Button
                variant={section.is_duplex ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1.5 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDuplex(section);
                }}
              >
                {section.is_duplex ? (
                  <FlipHorizontal className="h-3 w-3" />
                ) : (
                  <FlipVertical className="h-3 w-3" />
                )}
                {section.is_duplex ? "Duplex" : "Simplex"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
