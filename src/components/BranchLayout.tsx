import { Outlet } from "react-router-dom";
import BranchSidebar from "@/components/BranchSidebar";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranchSubscriptionGate } from "@/hooks/useBranchSubscriptions";
import { useDocumentBranding } from "@/hooks/useDocumentBranding";
import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

function SubscriptionGateBanner() {
  const { branchId, membershipRole } = useTenantContext();
  const gate = useBranchSubscriptionGate(branchId);
  if (!branchId || gate.loading || !gate.readOnly) return null;
  // Owners/admins bypass visually too — they need to see normal portal to manage
  if (membershipRole === "owner" || membershipRole === "admin") return null;
  return (
    <div className="border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        This branch is read-only — {gate.reason} New orders are disabled until the subscription is active.
      </span>
      <Link to="/branch/settings?tab=subscription" className="underline font-medium">
        Manage subscription
      </Link>
    </div>
  );
}

export default function BranchLayout() {
  const { tenantId, tenantName } = useTenantContext();
  useDocumentBranding(tenantId, tenantName, "Branch Portal");

    <div className="flex h-screen w-full bg-background">
      <BranchSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <SubscriptionGateBanner />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
