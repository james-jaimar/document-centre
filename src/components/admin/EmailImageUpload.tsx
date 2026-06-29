import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Upload, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface EmailImageUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the public URL to insert into the editor. */
  onInsert: (url: string, alt: string) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function EmailImageUpload({ open, onOpenChange, onInsert }: EmailImageUploadProps) {
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [altText, setAltText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setUrlInput("");
    setAltText("");
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    if (!ACCEPT.includes(file.type)) {
      toast({ title: "Unsupported format", description: "Use PNG, JPG, WebP or GIF.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: "Too large", description: "Maximum 5 MB per image.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const safeName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) || "image";
      const path = `${crypto.randomUUID()}-${safeName}.${ext}`;
      const { error } = await supabase.storage.from("email-assets").upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw error;
      // Build a stable, app-domain URL via the email-image proxy edge function.
      const origin = window.location.origin;
      const proxyUrl = `${origin}/email-image/${path}`;
      onInsert(proxyUrl, altText || safeName);
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload image.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  function handleInsertUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try { new URL(trimmed); } catch {
      toast({ title: "Invalid URL", variant: "destructive" });
      return;
    }
    onInsert(trimmed, altText);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!uploading) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Insert image</DialogTitle></DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "upload" | "url")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload"><Upload className="h-3.5 w-3.5 mr-1.5" />Upload</TabsTrigger>
            <TabsTrigger value="url"><LinkIcon className="h-3.5 w-3.5 mr-1.5" />From URL</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs">Image file (PNG / JPG / WebP / GIF, max 5 MB)</Label>
              <Input
                ref={fileRef}
                type="file"
                accept={ACCEPT.join(",")}
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Alt text (optional but recommended)</Label>
              <Input
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="e.g. PostNet store front"
                disabled={uploading}
              />
            </div>
            {uploading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </div>
            )}
          </TabsContent>

          <TabsContent value="url" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs">Image URL</Label>
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://…/image.jpg"
              />
            </div>
            <div>
              <Label className="text-xs">Alt text</Label>
              <Input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Short description" />
            </div>
            <DialogFooter>
              <Button onClick={handleInsertUrl} disabled={!urlInput.trim()}>Insert</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
