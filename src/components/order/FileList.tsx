import type { Tables } from "@/integrations/supabase/types";
import { FileText, Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";

type Document = Tables<"documents">;

interface UploadProgress {
  fileName: string;
  status: "uploading" | "analyzing" | "done" | "error";
  progress: number;
  error?: string;
}

interface FileListProps {
  documents: Document[];
  uploads: Record<string, UploadProgress>;
  selectedDocId: string | null;
  onSelect: (id: string) => void;
  onReprocess?: (doc: { id: string; file_path: string; file_name: string }) => Promise<void>;
}

function ThumbnailImage({ storagePath, className }: { storagePath: string; className?: string }) {
  const url = useSignedThumbnailUrl(storagePath);
  if (!url) return <FileText className="h-4 w-4 text-muted-foreground" />;
  return <img src={url} alt="" className={cn("h-full w-full object-contain", className)} />;
}

export default function FileList({
  documents,
  uploads,
  selectedDocId,
  onSelect,
  onReprocess,
}: FileListProps) {
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());
  const activeUploads = Object.values(uploads).filter(
    (u) => u.status !== "done"
  );

  const handleReprocess = async (doc: Document) => {
    if (!onReprocess || reprocessingIds.has(doc.id)) return;
    setReprocessingIds((prev) => new Set(prev).add(doc.id));
    try {
      await onReprocess({ id: doc.id, file_path: doc.file_path, file_name: doc.file_name });
    } finally {
      setReprocessingIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-2">
      {activeUploads.map((upload) => (
        <div
          key={upload.fileName}
          className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-2"
        >
          <div className="h-9 w-7 bg-muted flex items-center justify-center shrink-0">
            <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {upload.fileName}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground capitalize">
                {upload.status === "uploading"
                  ? "Uploading…"
                  : upload.status === "analyzing"
                  ? "Analyzing…"
                  : upload.status}
              </span>
            </div>
            {upload.error && (
              <p className="text-xs text-destructive mt-1">{upload.error}</p>
            )}
          </div>
        </div>
      ))}

      {documents.map((doc) => {
        const isReady = doc.document_status === "ready" || doc.document_status === "analyzed";
        const isAnalyzing = doc.document_status === "analyzed";
        const isError = doc.document_status === "error";
        const isProcessing = !isReady && !isError;
        const thumbnails = Array.isArray(doc.thumbnail_urls) ? (doc.thumbnail_urls as string[]) : [];
        const hasThumbnails = thumbnails.length > 0;
        const isReprocessing = reprocessingIds.has(doc.id);

        return (
          <div
            key={doc.id}
            onClick={() => isReady && onSelect(doc.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl border p-2 transition-all",
              selectedDocId === doc.id
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border/60 hover:border-primary/30 cursor-pointer",
              !isReady && "opacity-60 cursor-default"
            )}
          >
            <div className="h-9 w-7 bg-muted flex items-center justify-center shrink-0 overflow-hidden border border-border/40">
              {hasThumbnails ? (
                <ThumbnailImage storagePath={thumbnails[0]} />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {doc.file_name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {doc.page_count && (
                  <span className="text-xs text-muted-foreground">
                    {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
                  </span>
                )}
                {doc.page_width_mm && doc.page_height_mm && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(Number(doc.page_width_mm))}×
                    {Math.round(Number(doc.page_height_mm))}mm
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-1">
              {isReady && !hasThumbnails && onReprocess && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReprocess(doc);
                  }}
                  disabled={isReprocessing}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                  title="Reprocess PDF"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isReprocessing && "animate-spin")} />
                </button>
              )}
              {isProcessing || isReprocessing ? (
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              ) : isError ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              )}
            </div>
          </div>
        );
      })}

      {documents.length === 0 && activeUploads.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <FileText className="h-7 w-7 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No files uploaded yet</p>
        </div>
      )}
    </div>
  );
}
