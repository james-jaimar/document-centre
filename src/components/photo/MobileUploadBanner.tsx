import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Number of files currently uploading (0 when idle). */
  uploadingCount: number;
  /** Total files in the current batch (resets to 0 when batch completes). */
  totalCount: number;
};

/**
 * Prominent, animated upload status banner for the mobile photo flow.
 * Replaces small toasts so customers don't tap away mid-upload.
 */
export function MobileUploadBanner({ uploadingCount, totalCount }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (uploadingCount === 0 && totalCount > 0) {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 1400);
      return () => clearTimeout(t);
    }
  }, [uploadingCount, totalCount]);

  const isUploading = uploadingCount > 0;
  if (!isUploading && !showSuccess) return null;

  const done = Math.max(0, totalCount - uploadingCount);

  return (
    <div
      role="status"
      aria-live="polite"
      className="md:hidden sticky top-0 z-40 -mx-4 px-4 pt-2 pb-3 animate-fade-in"
    >
      <div
        className={cn(
          "rounded-xl px-4 py-3 shadow-lg text-primary-foreground transition-colors",
          isUploading ? "bg-primary" : "bg-emerald-600",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/20">
            {isUploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold leading-tight">
              {isUploading
                ? totalCount > 1
                  ? `Uploading ${done + 1} of ${totalCount} photos…`
                  : "Uploading your photo…"
                : "All photos uploaded"}
            </div>
            {isUploading && (
              <div className="text-xs font-medium text-white/85 mt-0.5">
                Please keep this tab open — large photos can take a moment.
              </div>
            )}
          </div>
        </div>

        {isUploading && (
          <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 w-1/3 bg-white/60 rounded-full animate-[shimmer_1.4s_ease-in-out_infinite]" />
          </div>
        )}
      </div>
    </div>
  );
}
