import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download, Upload, Loader2, FileSpreadsheet, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatPrice } from "@/lib/formatCurrency";

interface DiffRow {
  tab: string;
  rowKey: string;
  label: string;
  sellBefore: number;
  sellAfter: number;
  costBefore: number;
  costAfter: number;
}

interface PreviewPayload {
  filename: string;
  changes: DiffRow[];
  summary: { total: number; byTab: Record<string, number> };
}

const FN = "branch-pricing-workbook";

export default function BranchPricingIO({ branchId }: { branchId: string }) {
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);

  async function invokeRaw(action: string, opts: RequestInit = {}) {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const url = `${(supabase as any).functionsUrl ?? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`}/${FN}?action=${action}&branch_id=${branchId}`;
    return fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers ?? {}),
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      },
    });
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await invokeRaw("export");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? `branch-pricing-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Pricing downloaded", description: filename });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await invokeRaw("preview", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview failed");
      if (!json.changes.length) {
        toast({ title: "No changes detected", description: "Your uploaded file matches current pricing." });
        return;
      }
      setPreview(json);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    setApplying(true);
    try {
      const res = await invokeRaw("apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          filename: preview.filename,
          changes: preview.changes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Apply failed");
      setPreview(null);
      qc.invalidateQueries();
      const snapshotId = json.snapshot_id;
      toast({
        title: `${json.applied} price${json.applied === 1 ? "" : "s"} updated`,
        description:
          json.errors?.length
            ? `${json.errors.length} row(s) failed. Click Undo within 24h to revert.`
            : "Click Undo within 24h if this was a mistake.",
        action: (
          <button
            className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
            onClick={() => handleUndo(snapshotId)}
          >
            Undo
          </button>
        ) as any,
      });
    } catch (e: any) {
      toast({ title: "Apply failed", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  async function handleUndo(snapshotId: string) {
    try {
      const res = await invokeRaw("undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot_id: snapshotId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Undo failed");
      qc.invalidateQueries();
      toast({ title: `Reverted ${json.reverted} price${json.reverted === 1 ? "" : "s"}` });
    } catch (e: any) {
      toast({ title: "Undo failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 flex flex-col md:flex-row md:items-center gap-4 md:justify-between">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Bulk-edit your prices in Excel</p>
              <p className="text-muted-foreground">
                Download every price your branch charges into one spreadsheet, edit in Excel,
                and upload it back. You'll get a preview before anything changes, and every
                upload can be undone in one click for 24 hours.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
              Download pricing (.xlsx)
            </Button>
            <label>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.currentTarget.value = "";
                }}
              />
              <Button asChild disabled={uploading}>
                <span>
                  {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                  Upload updated pricing
                </span>
              </Button>
            </label>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review price changes</DialogTitle>
            <DialogDescription>
              {preview?.summary.total} change{preview?.summary.total === 1 ? "" : "s"} detected in{" "}
              <span className="font-medium">{preview?.filename}</span>. Nothing is saved until you click Apply.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Tab</th>
                  <th className="text-left px-3 py-2 font-medium">Row</th>
                  <th className="text-right px-3 py-2 font-medium">Sell</th>
                  <th className="text-right px-3 py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {preview?.changes.map((c, i) => {
                  const sellDelta = c.sellAfter - c.sellBefore;
                  const costDelta = c.costAfter - c.costBefore;
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{c.tab}</td>
                      <td className="px-3 py-2">{c.label}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {sellDelta === 0 ? (
                          <span className="text-muted-foreground">{formatPrice(c.sellAfter)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-muted-foreground line-through">{formatPrice(c.sellBefore)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className={sellDelta > 0 ? "text-emerald-600" : "text-amber-600"}>
                              {formatPrice(c.sellAfter)}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {costDelta === 0 ? (
                          <span className="text-muted-foreground">{formatPrice(c.costAfter)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-muted-foreground line-through">{formatPrice(c.costBefore)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className={costDelta > 0 ? "text-emerald-600" : "text-amber-600"}>
                              {formatPrice(c.costAfter)}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={applying}>
              {applying ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Apply {preview?.summary.total} change{preview?.summary.total === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
