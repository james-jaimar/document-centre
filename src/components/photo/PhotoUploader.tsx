import { useCallback, useRef } from "react";
import { Upload, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoUploaderProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export default function PhotoUploader({ onFiles, disabled, className }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList).filter((f) =>
        /^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) ||
        /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name),
      );
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles, disabled],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={onDrop}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer",
        "border-border bg-muted/20 hover:border-primary/50 hover:bg-primary/5",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
        <ImagePlus className="h-7 w-7 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">
          Drag photos here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground">
          JPG, PNG, WEBP or HEIC · up to 50 MB each
        </p>
      </div>
      <div className="flex items-center gap-1 text-xs text-primary font-medium">
        <Upload className="h-3.5 w-3.5" />
        Add photos
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
