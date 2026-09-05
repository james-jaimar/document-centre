import { useState } from "react";
import { Download, FileText, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  formatBytes,
  getAttachmentUrl,
  isImageAttachment,
  type MessageAttachmentRow,
} from "@/lib/messages/attachments";

interface Props {
  attachments: MessageAttachmentRow[] | null | undefined;
}

/** Compact clickable chips shown under a message bubble. */
export default function MessageAttachmentChips({ attachments }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const open = async (att: MessageAttachmentRow) => {
    setBusyId(att.id);
    try {
      const url = await getAttachmentUrl(att.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err?.message || "Could not open this attachment");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {attachments.map((att) => (
        <button
          key={att.id}
          type="button"
          onClick={() => open(att)}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted transition-colors"
        >
          {busyId === att.id ? (
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          ) : isImageAttachment(att.mime_type, att.file_name) ? (
            <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate max-w-[160px]">{att.file_name}</span>
          {att.file_size ? (
            <span className="text-muted-foreground shrink-0">{formatBytes(att.file_size)}</span>
          ) : null}
          <Download className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
