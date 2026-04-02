import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import {
  FileText,
  Palette,
  FlipHorizontal,
  FlipVertical,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";

type DocumentSection = Tables<"document_sections">;
type Document = Tables<"documents">;

function SectionThumbnail({ storagePath, isColor }: { storagePath: string; isColor: boolean }) {
  const url = useSignedThumbnailUrl(storagePath);
  if (!url) return <FileText className="h-4 w-4 text-muted-foreground/40" />;
  return <img src={url} alt="" className={cn("h-full w-full object-contain", !isColor && "grayscale")} />;
}

/* ─── Family-aware labels ─── */

const DEFAULT_LABELS: Record<string, string> = {
  front_cover: "Front Cover",
  back_cover: "Back Cover",
  body: "Body Pages",
  insert: "Insert",
  tab: "Tab Divider",
};

const BROCHURE_LABELS: Record<string, string> = {
  front_cover: "Outside",
  back_cover: "Inside",
  body: "Body Pages",
  insert: "Insert",
  tab: "Tab Divider",
};

const FLYER_LABELS: Record<string, string> = {
  front_cover: "Front",
  back_cover: "Back",
  body: "Body Pages",
  insert: "Insert",
  tab: "Tab Divider",
};

const POSTER_LABELS: Record<string, string> = {
  front_cover: "Print",
  back_cover: "Print",
  body: "Print",
  insert: "Insert",
  tab: "Tab Divider",
};

function getLabels(familySlug?: string | null): Record<string, string> {
  if (familySlug === "brochures") return BROCHURE_LABELS;
  if (familySlug === "flyers") return FLYER_LABELS;
  if (familySlug === "posters") return POSTER_LABELS;
  return DEFAULT_LABELS;
}

/* Hide duplex toggle for these families */
const HIDE_DUPLEX = new Set(["brochures", "posters"]);
/* Hide colour toggle for these families */
const HIDE_COLOUR = new Set(["posters"]);

interface SectionListProps {
  sections: DocumentSection[];
  documents: Document[];
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  onToggleColor: (section: DocumentSection) => void;
  onToggleDuplex: (section: DocumentSection) => void;
  onMove: (sectionId: string, direction: "up" | "down") => void;
  familySlug?: string | null;
}

export default function SectionList({
  sections,
  documents,
  selectedSectionId,
  onSelect,
  onToggleColor,
  onToggleDuplex,
  onMove,
  familySlug,
}: SectionListProps) {
  const labels = getLabels(familySlug);
  const hideDuplex = HIDE_DUPLEX.has(familySlug ?? "");
  const hideColour = HIDE_COLOUR.has(familySlug ?? "");

  const getDoc = (docId: string | null) =>
    documents.find((d) => d.id === docId);

  // Filter out tabs and inserts — those belong on the Configure Options page
  const fileSections = sections.filter(
    (s) => s.section_type !== "tab" && s.section_type !== "insert"
  );

  if (fileSections.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-7 w-7 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No sections yet</p>
        <p className="text-xs mt-1">
          Select a file and add it as a section
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fileSections.map((section, idx) => {
        const doc = getDoc(section.document_id);
        const pageCount = doc?.page_count ?? 0;
        const isInsertOrTab = section.section_type === "insert" || section.section_type === "tab";
        const showColourToggle = !isInsertOrTab && !hideColour;
        const showDuplexToggle = !isInsertOrTab && !hideDuplex;

        return (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={cn(
              "rounded-xl border p-2 transition-all cursor-pointer",
              selectedSectionId === section.id
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border/60 hover:border-primary/30"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              {/* Thumbnail or colored indicator for inserts/tabs */}
              {isInsertOrTab ? (
                <div
                  className="h-10 w-7 border border-border/40 overflow-hidden shrink-0 flex items-center justify-center rounded-sm"
                  style={{
                    backgroundColor: section.section_type === "tab" ? "#e0e7ff" : "#f0fdf4",
                  }}
                >
                  <span className="text-[8px] font-bold text-muted-foreground/60">
                    {section.section_type === "tab" ? "TAB" : "INS"}
                  </span>
                </div>
              ) : (() => {
                const thumbs = doc?.thumbnail_urls;
                const firstThumb =
                  Array.isArray(thumbs) && (thumbs as string[]).length > 0
                    ? (thumbs as string[])[0]
                    : null;
                return (
                  <div className="h-10 w-7 bg-muted/50 border border-border/40 overflow-hidden shrink-0 flex items-center justify-center">
                    {firstThumb ? (
                      <SectionThumbnail storagePath={firstThumb} isColor={section.is_color} />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                );
              })()}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold">
                    {labels[section.section_type] ?? section.section_type}
                  </span>
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
                <button
                  className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={idx === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(section.id, "up");
                  }}
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                  disabled={idx === fileSections.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(section.id, "down");
                  }}
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Per-section controls */}
            {(showColourToggle || showDuplexToggle) && (
              <div className="flex items-center gap-1.5 mt-2">
                {showColourToggle && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleColor(section);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                      section.is_color
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    <Palette className="h-3 w-3" />
                    {section.is_color ? "Colour" : "B&W"}
                  </button>
                )}
                {showDuplexToggle && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleDuplex(section);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                      section.is_duplex
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {section.is_duplex ? (
                      <FlipHorizontal className="h-3 w-3" />
                    ) : (
                      <FlipVertical className="h-3 w-3" />
                    )}
                    {section.is_duplex ? "Duplex" : "Simplex"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
