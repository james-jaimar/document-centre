import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Upload, Check, AlertCircle, Camera, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FUNCTIONS_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

interface SessionInfo {
  sessionId: string;
  tenantName: string;
  tenantLogo: string | null;
  expiresAt: string;
  fileCount: number;
}

interface FileUpload {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export default function MobileUpload() {
  const { token } = useParams<{ token: string }>();
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const [allDone, setAllDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Validate token on load
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(
          `${FUNCTIONS_URL}/mobile-upload?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "This upload link is invalid or has expired.");
          return;
        }
        const data = await res.json();
        setSessionInfo(data);
      } catch {
        setError("Unable to connect. Please check your internet connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const uploadFile = useCallback(
    async (fileUpload: FileUpload) => {
      const formData = new FormData();
      formData.append("file", fileUpload.file);

      setUploads((prev) =>
        prev.map((u) =>
          u.id === fileUpload.id
            ? { ...u, status: "uploading", progress: 30, error: undefined }
            : u,
        ),
      );

      try {
        const res = await fetch(
          `${FUNCTIONS_URL}/mobile-upload?token=${encodeURIComponent(token!)}`,
          { method: "POST", body: formData },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "");
        }

        setUploads((prev) =>
          prev.map((u) =>
            u.id === fileUpload.id ? { ...u, status: "done", progress: 100 } : u,
          ),
        );
      } catch (err: any) {
        const message =
          (err?.message && String(err.message).trim()) ||
          "Upload failed — tap Retry to try again.";
        setUploads((prev) =>
          prev.map((u) =>
            u.id === fileUpload.id
              ? { ...u, status: "error", error: message }
              : u,
          ),
        );
      }
    },
    [token],
  );

  const retryUpload = useCallback(
    async (id: string) => {
      const target = uploads.find((u) => u.id === id);
      if (!target) return;
      await uploadFile(target);
    },
    [uploads, uploadFile],
  );

  const retryAllFailed = useCallback(async () => {
    const failed = uploads.filter((u) => u.status === "error");
    for (const fu of failed) {
      await uploadFile(fu);
    }
  }, [uploads, uploadFile]);


  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const newUploads: FileUpload[] = Array.from(fileList).map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: "pending" as const,
      }));

      setUploads((prev) => [...prev, ...newUploads]);
      setAllDone(false);

      // Upload sequentially to avoid overwhelming mobile connection
      for (const fu of newUploads) {
        await uploadFile(fu);
      }

      // Only flip to "all done" when nothing failed; otherwise keep the
      // selector + per-row Retry buttons visible.
      setUploads((prev) => {
        const allFinished = prev.every(
          (u) => u.status === "done" || u.status === "error",
        );
        const anyError = prev.some((u) => u.status === "error");
        if (allFinished && !anyError) setAllDone(true);
        return prev;
      });
    },
    [uploadFile],
  );

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Verifying upload link…</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h1 className="text-xl font-semibold">Upload Not Available</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const doneCount = uploads.filter((u) => u.status === "done").length;
  const errorCount = uploads.filter((u) => u.status === "error").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {sessionInfo?.tenantLogo && (
            <img
              src={sessionInfo.tenantLogo}
              alt=""
              className="h-8 w-8 rounded object-contain"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">
              {sessionInfo?.tenantName}
            </h1>
            <p className="text-xs text-muted-foreground">Photo Upload</p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Upload button */}
        {!allDone && (
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full h-16 text-base gap-3"
              onClick={() => inputRef.current?.click()}
            >
              <Camera className="h-6 w-6" />
              Select Photos
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full h-14 text-base gap-3"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-5 w-5" />
              Browse Files
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {/* Upload progress */}
        {uploads.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {doneCount} of {uploads.length} uploaded
              </span>
              {errorCount > 0 && (
                <span className="text-destructive text-xs">
                  {errorCount} failed
                </span>
              )}
            </div>

            {errorCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={retryAllFailed}
              >
                <RefreshCw className="h-4 w-4" />
                Retry {errorCount} failed upload{errorCount !== 1 ? "s" : ""}
              </Button>
            )}



            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {uploads.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="flex-shrink-0">
                    {u.status === "done" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : u.status === "error" ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : u.status === "uploading" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{u.file.name}</p>
                    {u.status === "uploading" && (
                      <Progress value={u.progress} className="h-1 mt-1" />
                    )}
                    {u.error && (
                      <p className="text-xs text-destructive mt-0.5">
                        {u.error}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {(u.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All done message */}
        {allDone && doneCount > 0 && (
          <div className="text-center space-y-3 py-8">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-500" />
              </div>
            </div>
            <h2 className="text-lg font-semibold">Upload Complete!</h2>
            <p className="text-sm text-muted-foreground">
              {doneCount} file{doneCount !== 1 ? "s" : ""} uploaded successfully.
              You can close this page now — the files will appear on your computer
              automatically.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setUploads([]);
                setAllDone(false);
              }}
            >
              Upload More
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
