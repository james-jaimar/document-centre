import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useUnreadMessagesCustomer } from "@/hooks/useUnreadMessages";
import { useTenantSlug } from "@/hooks/useTenantSlug";

export default function MessagesBell() {
  const { tenantPath } = useTenantSlug();
  const { data: map = {} } = useUnreadMessagesCustomer();
  const total = Object.values(map).reduce((sum, n) => sum + (Number(n) || 0), 0);

  return (
    <Link
      to={tenantPath("orders")}
      className="relative rounded-xl p-2 hover:bg-secondary transition-colors"
      aria-label={total > 0 ? `${total} new messages` : "Messages"}
      title={total > 0 ? `${total} new message${total === 1 ? "" : "s"} from your store` : "Messages"}
    >
      <Bell className="h-5 w-5 text-muted-foreground" />
      {total > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-primary-foreground"
          style={{ background: "hsl(var(--destructive))" }}
        >
          {total > 9 ? "9+" : total}
        </span>
      )}
    </Link>
  );
}
