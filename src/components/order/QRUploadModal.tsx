import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUploadSession } from "@/hooks/useUploadSession";
import { Smartphone, Check, Loader2, X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface QRUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItemId: string | undefined;
  /** Called when the user closes the modal, with the list of new file IDs */
  onFilesReceived?: (fileIds: string[]) => void;
}

export default function QRUploadModal({
  open,
  onOpenChange,
  orderItemId,
  onFilesReceived,
}: QRUploadModalProps) {
  const {
    session,
    uploadUrl,
    incomingFiles,
    creating,
    error,
    createSession,
    closeSession,
    clearIncoming,
    clearError,
  } = useUploadSession(orderItemId);

  const [expiryText, setExpiryText] = useState("");

  // Create session when modal opens — only if no session and no error (prevents retry loop)
  useEffect(() => {
    if (open && !session && !creating && !error) {
      createSession();
    }
  }, [open, session, creating, error, createSession]);

  // Expiry countdown
  useEffect(() => {
    if (!session) return;
    const update = () => {
      const remaining = new Date(session.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setExpiryText("Expired");
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setExpiryText(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session]);

  const handleClose = () => {
    if (incomingFiles.length > 0) {
      onFilesReceived?.(incomingFiles.map((f) => f.id));
    }
    closeSession();
    clearIncoming();
    clearError();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Upload from Phone
          </DialogTitle>
          <DialogDescription>
            Scan this QR code with your phone to upload photos directly from your
            camera roll.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          {error && (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <X className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-sm text-destructive font-medium">
                Could not generate upload link
              </p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearError();
                  createSession();
                }}
              >
                Try again
              </Button>
            </div>
          )}

          {creating && !error && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating upload link…
            </div>
          )}

          {uploadUrl && (
            <>
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <QRCodeSVG
                  value={uploadUrl}
                  size={220}
                  level="M"
                  includeMargin
                />
              </div>

              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  Link expires in{" "}
                  <span className="font-mono font-medium text-foreground">
                    {expiryText}
                  </span>
                </p>
              </div>
            </>
          )}

          {/* Live incoming files */}
          {incomingFiles.length > 0 && (
            <div className="w-full space-y-2">
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                {incomingFiles.length} file{incomingFiles.length !== 1 ? "s" : ""}{" "}
                received
              </p>
              <div className="grid grid-cols-4 gap-2">
                {incomingFiles.slice(0, 12).map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-center h-16 rounded-lg bg-muted border text-xs text-muted-foreground truncate p-1"
                    title={f.file_name}
                  >
                    <ImageIcon className="h-6 w-6 text-primary/50" />
                  </div>
                ))}
                {incomingFiles.length > 12 && (
                  <div className="flex items-center justify-center h-16 rounded-lg bg-muted border text-xs text-muted-foreground">
                    +{incomingFiles.length - 12} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            {incomingFiles.length > 0 ? "Done" : "Cancel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
