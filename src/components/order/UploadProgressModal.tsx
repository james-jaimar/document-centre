import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, AlertCircle, Upload, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadProgress {
  fileName: string;
  status: "uploading" | "analyzing" | "done" | "error";
  progress: number;
  error?: string;
  statusText?: string;
}

interface UploadProgressModalProps {
  open: boolean;
  uploads: Record<string, UploadProgress>;
  onContinue: () => void;
}

export default function UploadProgressModal({
  open,
  uploads,
  onContinue,
}: UploadProgressModalProps) {
  const entries = Object.values(uploads);
  const uploading = entries.filter((u) => u.status === "uploading").length;
  const analyzing = entries.filter((u) => u.status === "analyzing").length;
  const completed = entries.filter((u) => u.status === "done").length;
  const errors = entries.filter((u) => u.status === "error").length;
  const allDone = entries.length > 0 && entries.every((u) => u.status === "done" || u.status === "error");

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Uploading Files
          </DialogTitle>
        </DialogHeader>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2">
          {uploading > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {uploading} Uploading
            </Badge>
          )}
          {analyzing > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {analyzing} Processing
            </Badge>
          )}
          {completed > 0 && (
            <Badge className="gap-1 bg-primary/10 text-primary border-primary/20">
              <CheckCircle2 className="h-3 w-3" />
              {completed} Complete
            </Badge>
          )}
          {errors > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors} Error
            </Badge>
          )}
        </div>

        {/* File list */}
        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {entries.map((upload) => (
            <div
              key={upload.fileName}
              className={cn(
                "rounded-lg border p-3 space-y-2 transition-colors",
                upload.status === "done"
                  ? "border-primary/20 bg-primary/5"
                  : upload.status === "error"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border bg-muted/20"
              )}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground truncate flex-1">
                  {upload.fileName}
                </span>
                <div className="shrink-0">
                  {upload.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : upload.status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  )}
                </div>
              </div>

              <Progress value={upload.progress} className="h-1.5" />

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {upload.status === "uploading"
                    ? "Uploading file…"
                    : upload.status === "analyzing"
                    ? "Processing PDF…"
                    : upload.status === "done"
                    ? "Ready"
                    : "Failed"}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {Math.round(upload.progress)}%
                </span>
              </div>

              {upload.error && (
                <p className="text-xs text-destructive">{upload.error}</p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <button
            onClick={onContinue}
            disabled={!allDone}
            className={cn(
              "soft-button soft-button-primary w-full rounded-xl text-sm py-2.5 transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {allDone ? "Continue" : "Please wait…"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
