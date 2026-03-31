import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderAdminStatus } from "@/lib/orders/types";
import { ADMIN_STATUS_CONFIG } from "@/lib/orders/status-maps";

interface Props {
  statuses: OrderAdminStatus[];
  counts?: Record<string, number>;
  selected: OrderAdminStatus[];
  onToggle: (status: OrderAdminStatus) => void;
}

export function OrderStatusChips({ statuses, counts, selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {statuses.map((status) => {
        const config = ADMIN_STATUS_CONFIG[status];
        const isActive = selected.includes(status);
        const count = counts?.[status];
        return (
          <button
            key={status}
            onClick={() => onToggle(status)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all border",
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {config.label}
            {count != null && (
              <span className={cn(
                "ml-0.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold min-w-[18px]",
                isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
