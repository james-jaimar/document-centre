import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Button } from "@/components/ui/button";
import { UserCheck, LogOut } from "lucide-react";

export function ImpersonationBanner() {
  const { active, endImpersonation } = useImpersonation();
  if (!active) return null;

  const name =
    [active.target.first_name, active.target.last_name].filter(Boolean).join(" ") ||
    active.target.display_name ||
    active.target.email;

  return (
    <div
      className="sticky top-0 z-[100] w-full bg-amber-500 text-amber-950 shadow-md border-b border-amber-700"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm font-medium">
        <div className="flex items-center gap-2 min-w-0">
          <UserCheck className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Viewing as customer <strong>{name}</strong> ({active.target.email}) — actions are
            audited. Online card payments are disabled.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="bg-amber-950 text-amber-50 hover:bg-amber-900 shrink-0"
          onClick={() => endImpersonation("user_exit")}
        >
          <LogOut className="h-4 w-4 mr-1" />
          Exit
        </Button>
      </div>
    </div>
  );
}
