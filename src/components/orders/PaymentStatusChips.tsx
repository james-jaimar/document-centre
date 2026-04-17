import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/lib/orders/types";
import { PAYMENT_STATUS_CONFIG } from "@/lib/orders/status-maps";

interface Props {
  statuses: PaymentStatus[];
  selected: PaymentStatus[];
  onToggle: (s: PaymentStatus) => void;
}

export function PaymentStatusChips({ statuses, selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground mr-1">Payment:</span>
      {statuses.map((status) => {
        const config = PAYMENT_STATUS_CONFIG[status];
        const isActive = selected.includes(status);
        return (
          <button
            key={status}
            onClick={() => onToggle(status)}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all border",
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
