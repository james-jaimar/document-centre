import { useCallback, useRef, useState } from "react";
import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OFFICE_ACCEPT_STRING,
  OFFICE_MIME_TYPES,
  isOfficeFile,
} from "@/lib/officeFiles";

interface FileUploaderProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

function isAcceptedFile(f: File): boolean {
  if (f.type === "application/pdf") return true;
  if (f.type.startsWith("image/")) return true;
  if (OFFICE_MIME_TYPES.has(f.type)) return true;
  // Browsers (especially Safari/Firefox) often report empty or
  // application/octet-stream for .odt/.odp/.ods — fall back to extension.
  return isOfficeFile(f);
}

export default function FileUploader({ onFiles, disabled }: FileUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files).filter(isAcceptedFile);
      if (files.length) onFiles(files);
    },
    [onFiles, disabled]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) onFiles(files);
      e.target.value = "";
    },
    [onFiles]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed min-h-[140px] p-6 cursor-pointer transition-all",
        dragOver
          ? "border-primary bg-primary/10"
          : "border-primary/30 hover:border-primary/50 hover:bg-primary/5",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Cloud className="h-5 w-5 text-primary" />
      </div>
      <div className="text-center">
        <p className="font-medium text-sm text-foreground">
          Drop PDF, Word, PowerPoint or image files here
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          or click to browse (PDF, DOCX, PPTX, ODT, JPG, PNG, WEBP)
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={`application/pdf,image/jpeg,image/png,image/webp,image/tiff,${OFFICE_ACCEPT_STRING}`}
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
