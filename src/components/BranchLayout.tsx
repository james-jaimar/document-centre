import { useEffect, useMemo, useRef } from "react";
import { Outlet, Link } from "react-router-dom";
import BranchSidebar from "@/components/BranchSidebar";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranchSubscriptionGate } from "@/hooks/useBranchSubscriptions";
import { useDocumentBranding } from "@/hooks/useDocumentBranding";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import StaffMessagesBell from "@/components/staff/StaffMessagesBell";
import { useUnreadMessagesStaff } from "@/hooks/useUnreadMessages";
import { useDocumentTitleUnread } from "@/hooks/useDocumentTitleUnread";

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
  const { tenantId, tenantName, branchId } = useTenantContext();
  useDocumentBranding(tenantId, tenantName, "Branch Portal");
  const qc = useQueryClient();
  const startedRef = useRef<string | null>(null);

  // Stamp trial_started_at on first authenticated load for this branch
  useEffect(() => {
    if (!branchId || startedRef.current === branchId) return;
    startedRef.current = branchId;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        await supabase.functions.invoke("start-branch-trial", { body: { branch_id: branchId } });
        qc.invalidateQueries({ queryKey: ["branch_subscriptions"] });
      } catch (e) {
        console.warn("start-branch-trial failed (non-fatal):", e);
      }
    })();
  }, [branchId, qc]);


  const { data: unreadMap = {} } = useUnreadMessagesStaff(tenantId, branchId);
  const totalUnread = useMemo(
    () => Object.values(unreadMap).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [unreadMap],
  );
  useDocumentTitleUnread(totalUnread);

  return (
    <div className="flex h-screen w-full bg-background">
      <BranchSidebar unreadOrderCount={totalUnread} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center justify-end gap-2 border-b bg-background px-4">
          <StaffMessagesBell ordersBasePath="/branch/orders" />
        </header>
        <SubscriptionGateBanner />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
