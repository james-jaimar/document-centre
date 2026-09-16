import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildFilename, downloadObject } from "@/lib/downloadFile";
import type { PreviewSourceDocument } from "@/lib/orders/previewFallbacks";

export interface CustomerFileEntry {
  key: string;
  name: string;
  path: string;
  pageCount?: number | null;
  sizeBytes?: number | null;
}

const fmtSize = (bytes?: number | null) => {
  const n = Number(bytes ?? 0);
  if (!n) return null;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/** Prefer the customer's original upload over any processed derivative. */
const originalPathFor = (doc: any): string | null => {
  const processed = (doc?.preflight_data as any)?.processed_file_path as string | undefined;
  return doc?.file_path || doc?.storage_path || processed || null;
};

const stripExt = (name: string) => name.replace(/\.pdf$/i, "");

/**
 * Build the de-duplicated list of files the customer uploaded for one job,
 * merging the `documents` rows (source uploads) with any `order_documents`
 * rows attached to the job.
 */
export function buildCustomerFiles(
  sourceDocs: PreviewSourceDocument[],
  jobDocs: any[],
): CustomerFileEntry[] {
  const out: CustomerFileEntry[] = [];
  const seen = new Set<string>();

  const push = (doc: any, fallbackName: string) => {
    const path = originalPathFor(doc);
    if (!path || seen.has(path)) return;
    seen.add(path);
    out.push({
      key: doc?.id ?? path,
      name: doc?.file_name || fallbackName,
      path,
      pageCount: doc?.page_count ?? null,
      sizeBytes: doc?.file_size ?? doc?.file_size_bytes ?? null,
    });
  };

  sourceDocs.forEach((doc, idx) => push(doc, `Document ${idx + 1}.pdf`));
  jobDocs.forEach((doc, idx) => push(doc, `Attachment ${idx + 1}.pdf`));
  return out;
}

interface Props {
  files: CustomerFileEntry[];
  orderNumber?: string | null;
  jobNumber?: string | null;
}

export default function CustomerFilesCard({ files, orderNumber, jobNumber }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  if (files.length === 0) return null;

  const nameFor = (f: CustomerFileEntry) =>
    buildFilename([orderNumber, jobNumber, stripExt(f.name)], "pdf");

  const grab = async (f: CustomerFileEntry) => {
    setBusyKey(f.key);
    try {
      await downloadObject(f.path, nameFor(f));
    } catch (err: any) {
      toast.error(err?.message || "Could not download this file");
    } finally {
      setBusyKey(null);
    }
  };

  const grabAll = async () => {
    setBulkBusy(true);
    try {
      for (const f of files) {
        await downloadObject(f.path, nameFor(f));
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not download all files");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h3 className="text-xs font-semibold">Customer's uploaded files</h3>
        {files.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={grabAll}
            disabled={bulkBusy || busyKey !== null}
          >
            {bulkBusy ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Download className="h-3 w-3 mr-1" />
            )}
            Download all
          </Button>
        )}
      </div>

      <div className="space-y-1">
        {files.map((f) => {
          const size = fmtSize(f.sizeBytes);
          const pages = Number(f.pageCount ?? 0);
          return (
            <div key={f.key} className="flex items-center gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <div className="truncate" title={f.name}>
                  {f.name}
                </div>
                {(pages > 0 || size) && (
                  <div className="text-[10px] text-muted-foreground">
                    {[pages > 0 ? `${pages} pages` : null, size].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] shrink-0"
                onClick={() => grab(f)}
                disabled={busyKey === f.key || bulkBusy}
              >
                {busyKey === f.key ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 mr-1" />
                )}
                Download
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
