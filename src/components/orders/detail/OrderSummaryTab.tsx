import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { ADMIN_STATUS_CONFIG, PAYMENT_STATUS_CONFIG } from "@/lib/orders/status-maps";
import { format } from "date-fns";

interface Props {
  order: any;
  jobs: any[];
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
}

export function OrderSummaryTab({ order, jobs, selectedJobId, onSelectJob }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Order ID</span>
        </div>
        <div className="text-lg font-bold font-mono">{order.order_number || "—"}</div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Status</span>
            <div className="mt-1">
              <StatusBadge {...ADMIN_STATUS_CONFIG[order.admin_status as keyof typeof ADMIN_STATUS_CONFIG]} />
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Payment</span>
            <div className="mt-1">
              <StatusBadge {...PAYMENT_STATUS_CONFIG[order.payment_status as keyof typeof PAYMENT_STATUS_CONFIG]} />
            </div>
          </div>
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Source</span>
            <span>{order.source_channel || order.storefront_name || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span>{order.customer_name || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Company</span>
            <span>{order.company_name || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date Required</span>
            <span>{order.date_required ? format(new Date(order.date_required), "yyyy/MM/dd") : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Turnaround</span>
            <span>{order.turnaround_time_text || "—"}</span>
          </div>
        </div>
      </div>

      {/* Job List */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Job List</span>
        </div>
        <div className="space-y-1">
          {jobs.map((job: any) => (
            <button
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              className={cn(
                "w-full flex items-center justify-between rounded-md px-3 py-2 text-xs text-left transition-colors",
                selectedJobId === job.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border hover:bg-muted"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-medium shrink-0">{job.job_number}</span>
                <span className="truncate">{job.product_name}</span>
              </div>
              <span className={cn(
                "text-[10px] shrink-0 ml-2",
                selectedJobId === job.id ? "text-primary-foreground/80" : "text-muted-foreground"
              )}>
                {job.job_status?.replace(/_/g, " ")}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
