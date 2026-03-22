import type { Tables } from "@/integrations/supabase/types";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";
import { FileText, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Document = Tables<"documents">;

interface DocumentPreviewThumbProps {
  document: Document | null;
  onClick: () => void;
}

function PreviewImage({ storagePath }: { storagePath: string }) {
  const url = useSignedThumbnailUrl(storagePath);
  if (!url) return <FileText className="h-8 w-8 text-muted-foreground/30" />;
  return <img src={url} alt="Page preview" className="h-full w-full object-contain" />;
}

export default function DocumentPreviewThumb({ document, onClick }: DocumentPreviewThumbProps) {
  const thumbnails = document
    ? Array.isArray(document.thumbnail_urls)
      ? (document.thumbnail_urls as string[])
      : []
    : [];
  const firstThumb = thumbnails.length > 0 ? thumbnails[0] : null;
  const isAnalyzing = document?.document_status === "analyzed";

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/50">
        <FileText className="h-10 w-10 mb-2 opacity-30" />
        <p className="text-xs text-center">Select a file to preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={cn(
          "relative group w-[140px] aspect-[210/297] bg-muted/30 border border-border/60",
          "flex items-center justify-center overflow-hidden",
          "hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
        )}
      >
        {firstThumb ? (
          <PreviewImage storagePath={firstThumb} />
        ) : (
          <FileText className="h-8 w-8 text-muted-foreground/30" />
        )}
        {/* Analyzing overlay */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-background/40 flex flex-col items-center justify-center gap-1.5">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <span className="text-[10px] font-medium text-primary">Processing…</span>
          </div>
        )}
        {/* Hover overlay */}
        {!isAnalyzing && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Search className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
      </button>

      <div className="text-center space-y-0.5">
        <p className="text-xs font-medium text-foreground truncate max-w-[160px]">
          {document.file_name}
        </p>
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          {document.page_count && (
            <span>{document.page_count} {document.page_count === 1 ? "page" : "pages"}</span>
          )}
          {document.page_width_mm && document.page_height_mm && (
            <span>
              {Math.round(Number(document.page_width_mm))}×{Math.round(Number(document.page_height_mm))}mm
            </span>
          )}
          {isAnalyzing && (
            <span className="text-primary animate-pulse">Processing pages…</span>
          )}
        </div>
      </div>
    </div>
  );
}
