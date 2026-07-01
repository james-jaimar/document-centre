import { useMemo } from "react";
import { Check, ChevronDown, Building2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLinkedBranches, type LinkedBranch } from "@/hooks/useLinkedBranches";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * Header dropdown for owners linked to multiple branches.
 * Switches the active membership (and therefore the active branch)
 * without leaving the branch portal. Also offers a special
 * "All my branches" scope, which currently only affects the Orders page.
 */
export function BranchSwitcher() {
  const { branches, isMultiBranchOperator } = useLinkedBranches();
  const { branchId, memberships, setActiveMembershipId } = useTenantContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAllScope = searchParams.get("scope") === "all";

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === branchId) ?? null,
    [branches, branchId]
  );

  if (!isMultiBranchOperator) {
    return activeBranch ? (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span className="font-medium text-foreground">{activeBranch.name}</span>
      </div>
    ) : null;
  }

  const grouped = branches.reduce<Record<string, LinkedBranch[]>>((acc, b) => {
    (acc[b.tenant_name] ??= []).push(b);
    return acc;
  }, {});

  const activateBranch = (b: LinkedBranch) => {
    const match = memberships.find(
      (m) => m.branch_id === b.id && m.tenant_id === b.tenant_id,
    );
    if (match) setActiveMembershipId(match.id);
    // Strip scope=all if present so we re-focus on a single branch.
    navigate("/branch/dashboard");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          {isAllScope ? (
            <>
              <Layers className="h-4 w-4" />
              <span>All my branches</span>
            </>
          ) : (
            <>
              <Building2 className="h-4 w-4" />
              <span className="max-w-[160px] truncate">
                {activeBranch?.name ?? "Choose branch"}
              </span>
            </>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={() => navigate("/branch/orders?scope=all")}
          className="gap-2"
        >
          <Layers className="h-4 w-4" />
          <div className="flex-1">
            <div className="text-sm font-medium">All my branches</div>
            <div className="text-xs text-muted-foreground">Unified orders view</div>
          </div>
          {isAllScope && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {Object.entries(grouped).map(([tenantName, list]) => (
          <div key={tenantName}>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {tenantName}
            </DropdownMenuLabel>
            {list.map((b) => (
              <DropdownMenuItem
                key={b.id}
                onClick={() => activateBranch(b)}
                className="gap-2"
              >
                <Building2 className="h-4 w-4" />
                <span className="flex-1 truncate">{b.name}</span>
                {activeBranch?.id === b.id && !isAllScope && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
