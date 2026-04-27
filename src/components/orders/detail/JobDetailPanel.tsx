import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { JOB_STATUS_CONFIG, PROOF_STATUS_CONFIG, URGENCY_CONFIG } from "@/lib/orders/status-maps";
import { Separator } from "@/components/ui/separator";
import PreviewLightbox from "@/components/order/PreviewLightbox";
import { inferPreviewTypeFromJob } from "@/lib/orders/inferPreviewType";
import type { JobConfiguration, ConfigSection } from "@/lib/orders/types";
import PhotoPrintsAdminGallery from "./PhotoPrintsAdminGallery";
import { formatPrice } from "@/lib/formatCurrency";

interface Props {
  job: any;
  documents: any[];
  /** ISO currency for the parent order. Used to render job prices in the
   *  customer's region (GBP/USD/EUR/AUD). Defaults to ZAR for safety. */
  currency?: string;
}

export function JobDetailPanel({ job, documents, currency = "ZAR" }: Props) {
  const fmt = (amount: number) => formatPrice(Number(amount ?? 0), currency);
  const config: JobConfiguration = job.configuration || {};
  const sections: ConfigSection[] = config.sections || [];
  const summary = config.summary || {};
  const jobDocs = documents.filter((d: any) => d.job_id === job.id);

  const previewSnap = ((config as any).preview ?? {}) as any;
  const previewThumbs: string[] = Array.isArray(previewSnap.thumbnails) ? previewSnap.thumbnails : [];
  const hasPreview = previewThumbs.some((t) => !!t);
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="space-y-2">
      {/* Merged Job header + info card */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] text-muted-foreground">Job ID</div>
            <div className="text-sm font-bold font-mono">{job.job_number}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground">Job Name</div>
            <div className="text-xs font-semibold">{job.job_name || job.product_name}</div>
          </div>
        </div>

        {/* Status badges inline */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">Status:</span>
            <StatusBadge {...JOB_STATUS_CONFIG[job.job_status as keyof typeof JOB_STATUS_CONFIG]} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">Proof:</span>
            <StatusBadge {...PROOF_STATUS_CONFIG[job.proof_status as keyof typeof PROOF_STATUS_CONFIG]} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">Urgency:</span>
            <StatusBadge {...URGENCY_CONFIG[job.urgency as keyof typeof URGENCY_CONFIG]} />
          </div>
        </div>

        {/* Preview button */}
        {hasPreview ? (
          <Button
            variant="default"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            View preview ({previewThumbs.filter(Boolean).length} pages)
          </Button>
        ) : (
          <div className="text-[11px] text-muted-foreground italic text-center">
            No customer preview available
          </div>
        )}

        <Separator className="my-1" />

        {/* Job info */}
        <div className="grid grid-cols-[100px_1fr] gap-y-1 text-xs">
          <span className="text-muted-foreground">Product</span>
          <span className="font-medium">{job.product_name}</span>

          {job.product_category && (
            <>
              <span className="text-muted-foreground">Category</span>
              <span>{job.product_category}</span>
            </>
          )}

          <span className="text-muted-foreground">Quantity</span>
          <span>
            <span className="text-base font-semibold">{Number(job.quantity).toLocaleString()}</span>
            {job.unit_label && <span className="text-muted-foreground ml-1">{job.unit_label}</span>}
            <span className="text-muted-foreground ml-1.5">
              ({Number(job.qty_sent).toLocaleString()} sent, {Number(job.qty_remaining).toLocaleString()} remaining)
            </span>
          </span>
        </div>

        {/* Summary specs */}
        {(summary.primary_spec_1_label || summary.primary_spec_2_label || summary.primary_spec_3_label) && (
          <div className="grid grid-cols-[100px_1fr] gap-y-1 text-xs">
            {summary.primary_spec_1_label && (
              <>
                <span className="text-muted-foreground">{summary.primary_spec_1_label}</span>
                <span>{summary.primary_spec_1_value}</span>
              </>
            )}
            {summary.primary_spec_2_label && (
              <>
                <span className="text-muted-foreground">{summary.primary_spec_2_label}</span>
                <span>{summary.primary_spec_2_value}</span>
              </>
            )}
            {summary.primary_spec_3_label && (
              <>
                <span className="text-muted-foreground">{summary.primary_spec_3_label}</span>
                <span>{summary.primary_spec_3_value}</span>
              </>
            )}
          </div>
        )}

        {/* Configuration sections */}
        {sections.map((section, idx) => (
          <div key={idx}>
            <Separator className="my-1" />
            <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              {section.title}
            </h4>
            <div className="grid grid-cols-[100px_1fr] gap-y-0.5 text-xs">
              {section.items.map((item, iIdx) => (
                <div key={iIdx} className="contents">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Separator className="my-1" />

        {/* Pricing */}
        <div className="grid grid-cols-[100px_1fr] gap-y-0.5 text-xs">
          <span className="text-muted-foreground">Net Price</span>
          <span className="font-medium">{fmt(job.net_price)}</span>

          <span className="text-muted-foreground">Cost Price</span>
          <span>{fmt(job.cost_price)}</span>

          {job.weight_kg && (
            <>
              <span className="text-muted-foreground">Weight</span>
              <span>{job.weight_kg}kg</span>
            </>
          )}
        </div>
      </div>

      {/* Photo Prints — admin gallery (replaces both attached files + photo list) */}
      {(config as any).photo_prints || job.product_category === "photo-prints" ? (
        <PhotoPrintsAdminGallery
          photoPrints={(config as any).photo_prints}
          orderItemId={(config as any).source_order_item_id ?? null}
        />
      ) : (
        /* Attached files — hidden for photo prints jobs (gallery shows them visually instead) */
        jobDocs.length > 0 && (
          <div className="rounded-lg border bg-card p-3">
            <h3 className="text-xs font-semibold mb-1.5">Customer's Attached Files</h3>
            <div className="space-y-0.5">
              {jobDocs.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-2 text-xs">
                  <span className="text-primary hover:underline cursor-pointer">{doc.file_name}</span>
                  {doc.file_size_bytes && (
                    <span className="text-muted-foreground">
                      ({(doc.file_size_bytes / 1024).toFixed(0)}KB)
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {previewOpen && (
        <PreviewLightbox
          thumbnailPaths={previewThumbs}
          productType={
            (previewSnap.product_type as any) || inferPreviewTypeFromJob(job)
          }
          effects={previewSnap.effects}
          colorFlags={previewSnap.colorFlags}
          bleedFlags={previewSnap.bleedFlags}
          pageRoles={previewSnap.pageRoles}
          sectionTypes={previewSnap.sectionTypes}
          pageLabels={previewSnap.pageLabels}
          pageColors={previewSnap.pageColors}
          tabPositions={previewSnap.tabPositions}
          displayPageNumbers={previewSnap.displayPageNumbers}
          faceLabels={previewSnap.faceLabels}
          bindingEdge={previewSnap.bindingEdge}
          bindingArt={previewSnap.bindingArt}
          pageAspectRatio={previewSnap.pageAspectRatio ?? undefined}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
