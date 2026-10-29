import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function artworkChoices(configuration: any): { path: string; name: string }[] {
  const choices = new Map<string, string>();
  function walk(value: any) {
    if (!value || typeof value !== "object") return;
    const path = value.storage_path || value.file_path;
    if (typeof path === "string") choices.set(path, value.file_name || path.split("/").pop() || "Artwork");
    Object.values(value).forEach(walk);
  }
  walk(configuration);
  return [...choices].map(([path, name]) => ({ path, name }));
}

export default function ArtworkUpdateControl({ orderId, jobs, staff = false }: { orderId: string; jobs: any[]; staff?: boolean }) {
  const qc = useQueryClient();
  const eligible = jobs.filter(j => isJobRevisable(j, staff));
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState(eligible[0]?.id || "");
  const [path, setPath] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const job = eligible.find(j => j.id === jobId) || eligible[0];
  const choices = artworkChoices(job?.configuration);
  const raster = job?.configuration?.photo_prints || job?.configuration?.canvas_prints;
  const templated = !!job?.configuration?.templated_artwork;

  async function invoke(action: string, body: any) {
    const { data, error } = await supabase.functions.invoke("order-engine", { body: { action, ...body } });
    if (error) {
      let message = error.message;
      try { const detail = await (error as any).context?.json(); message = detail?.error || message; } catch { /* response unavailable */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  async function submit() {
    if (!file || !job || !path) return;
    setBusy(true);
    try {
      const prepared = await invoke("prepareArtworkRevision", { job_id: job.id, replaces_path: path,
        file_name: file.name, file_size_bytes: file.size, mime_type: file.type, reason });
      const uploaded = await fetch(prepared.upload_url, { method: "PUT", body: file });
      if (!uploaded.ok) throw new Error("Could not upload artwork. Please try again.");
      await invoke("applyArtworkRevision", { job_id: job.id, revision_id: prepared.revision_id });
      await qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      toast.success("Artwork updated — new proof review required");
      setOpen(false); setFile(null); setPath(""); setReason("");
    } catch (error: any) { toast.error(error.message || "Artwork update failed"); }
    finally { setBusy(false); }
  }
  if (!jobs.length) return null;
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Upload className="mr-1.5 h-3.5 w-3.5" />Update artwork</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Update artwork</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Job</Label><Select value={jobId} onValueChange={value => { setJobId(value); setPath(""); setFile(null); }}>
            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.job_number} — {j.product_name}</SelectItem>)}</SelectContent>
          </Select></div>
          {raster ? <p className="text-sm text-muted-foreground">Please contact the branch for photo or canvas layout changes.</p> : <>
            <div><Label>Artwork to replace</Label><Select value={path} onValueChange={setPath}>
              <SelectTrigger><SelectValue placeholder="Select original file" /></SelectTrigger>
              <SelectContent>{choices.map(choice => <SelectItem key={choice.path} value={choice.path}>{choice.name}</SelectItem>)}</SelectContent>
            </Select></div>
            <div><Label htmlFor="replacement-artwork">New artwork</Label><Input id="replacement-artwork" type="file" accept={templated ? ".pdf,.png,.jpg,.jpeg" : ".pdf"} disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)} /></div>
            <p className="text-xs text-muted-foreground">Original files are retained. A new proof must be reviewed before printing. Prices and quantities stay unchanged.</p>
            <div><Label htmlFor="artwork-reason">Reason {staff ? "(required)" : "(optional)"}</Label><Textarea id="artwork-reason" value={reason} maxLength={1000} disabled={busy} onChange={event => setReason(event.target.value)} /></div>
          </>}
        </div>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={busy || raster || !path || !file || (staff && !reason.trim())} onClick={submit}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit artwork</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}