import { StatusBadge } from "@/components/orders/StatusBadge";
import { JOB_STATUS_CONFIG, PROOF_STATUS_CONFIG, URGENCY_CONFIG } from "@/lib/orders/status-maps";
import { Separator } from "@/components/ui/separator";
import type { JobConfiguration, ConfigSection } from "@/lib/orders/types";

interface Props {
  job: any;
  documents: any[];
}

const fmt = (amount: number, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);

export function JobDetailPanel({ job, documents }: Props) {
  const config: JobConfiguration = job.configuration || {};
  const sections: ConfigSection[] = config.sections || [];
  const summary = config.summary || {};
  const jobDocs = documents.filter((d: any) => d.job_id === job.id);

  return (
    <div className="space-y-4">
      {/* Job header */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Job ID</div>
            <div className="text-lg font-bold font-mono">{job.job_number}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Job Name</div>
            <div className="text-sm font-semibold">{job.job_name || job.product_name}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Job Status</div>
            <div className="mt-1">
              <StatusBadge {...JOB_STATUS_CONFIG[job.job_status as keyof typeof JOB_STATUS_CONFIG]} />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Proof Status</div>
            <div className="mt-1">
              <StatusBadge {...PROOF_STATUS_CONFIG[job.proof_status as keyof typeof PROOF_STATUS_CONFIG]} />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Urgency</div>
            <div className="mt-1">
              <StatusBadge {...URGENCY_CONFIG[job.urgency as keyof typeof URGENCY_CONFIG]} />
            </div>
          </div>
        </div>
      </div>

      {/* Job Info — rendered from configuration JSON */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold">Job Info</h3>

        <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <span className="text-muted-foreground text-xs">Product</span>
          <span className="font-medium">{job.product_name}</span>

          {job.product_category && (
            <>
              <span className="text-muted-foreground text-xs">Category</span>
              <span>{job.product_category}</span>
            </>
          )}

          <span className="text-muted-foreground text-xs">Quantity</span>
          <span>
            <span className="text-lg font-bold">{Number(job.quantity).toLocaleString()}</span>
            {job.unit_label && <span className="text-muted-foreground ml-1 text-xs">{job.unit_label}</span>}
            <span className="text-xs text-muted-foreground ml-2">
              ({Number(job.qty_sent).toLocaleString()} sent, {Number(job.qty_remaining).toLocaleString()} remaining)
            </span>
          </span>
        </div>

        {/* Summary specs from configuration.summary */}
        {(summary.primary_spec_1_label || summary.primary_spec_2_label || summary.primary_spec_3_label) && (
          <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            {summary.primary_spec_1_label && (
              <>
                <span className="text-muted-foreground text-xs">{summary.primary_spec_1_label}</span>
                <span>{summary.primary_spec_1_value}</span>
              </>
            )}
            {summary.primary_spec_2_label && (
              <>
                <span className="text-muted-foreground text-xs">{summary.primary_spec_2_label}</span>
                <span>{summary.primary_spec_2_value}</span>
              </>
            )}
            {summary.primary_spec_3_label && (
              <>
                <span className="text-muted-foreground text-xs">{summary.primary_spec_3_label}</span>
                <span>{summary.primary_spec_3_value}</span>
              </>
            )}
          </div>
        )}

        {/* Configuration sections */}
        {sections.map((section, idx) => (
          <div key={idx}>
            <Separator className="my-2" />
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {section.title}
            </h4>
            <div className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
              {section.items.map((item, iIdx) => (
                <div key={iIdx} className="contents">
                  <span className="text-muted-foreground text-xs">{item.label}</span>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Separator />

        {/* Pricing */}
        <div className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
          <span className="text-muted-foreground text-xs">Net Price</span>
          <span className="font-medium">{fmt(job.net_price)}</span>

          <span className="text-muted-foreground text-xs">Cost Price</span>
          <span>{fmt(job.cost_price)}</span>

          {job.weight_kg && (
            <>
              <span className="text-muted-foreground text-xs">Weight</span>
              <span>{job.weight_kg}kg</span>
            </>
          )}
        </div>
      </div>

      {/* Attached files */}
      {jobDocs.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2">Customer's Attached Files</h3>
          <div className="space-y-1">
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
      )}
    </div>
  );
}
