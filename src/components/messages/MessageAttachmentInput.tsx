import { useRef, useState } from "react";
import { Paperclip, X, Loader2, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_ACCEPT_STRING,
  MAX_ATTACHMENTS_PER_MESSAGE,
  formatBytes,
  isImageAttachment,
  validateAttachment,
} from "@/lib/messages/attachments";

export interface SelectedAttachment {
  localId: string;
  file: File;
}

interface Props {
  files: SelectedAttachment[];
  onChange: (files: SelectedAttachment[]) => void;
  uploading?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Paperclip button + the list of files queued on the current message. */
export default function MessageAttachmentInput({
  files,
  onChange,
  uploading,
  disabled,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (incoming: File[]) => {
    setError(null);
    const next = [...files];
    for (const file of incoming) {
      if (next.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        setError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
        break;
      }
      const problem = validateAttachment(file);
      if (problem) {
        setError(problem);
        continue;
      }
      next.push({ localId: crypto.randomUUID(), file });
    }
    onChange(next);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-3.5 w-3.5" />
        Attach file
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT_STRING}
        className="hidden"
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.localId}
              className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
            >
              {isImageAttachment(f.file.type, f.file.name) ? (
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate flex-1">{f.file.name}</span>
              <span className="text-muted-foreground shrink-0">{formatBytes(f.file.size)}</span>
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => onChange(files.filter((x) => x.localId !== f.localId))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
