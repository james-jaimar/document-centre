import { useMemo } from "react";
import { Link } from "react-router-dom";
import BranchSidebar from "@/components/BranchSidebar";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranchSubscriptionGate } from "@/hooks/useBranchSubscriptions";
import { useDocumentBranding } from "@/hooks/useDocumentBranding";
import { AlertCircle, Mail } from "lucide-react";
import StaffMessagesBell from "@/components/staff/StaffMessagesBell";
import { useUnreadMessagesStaff } from "@/hooks/useUnreadMessages";
import { useDocumentTitleUnread } from "@/hooks/useDocumentTitleUnread";
import { useMessageDesktopAlerts } from "@/hooks/useMessageDesktopAlerts";

import { BranchSwitcher } from "@/components/branch/BranchSwitcher";
import { useEnsureBranchPricingSeeded } from "@/hooks/useEnsureBranchPricingSeeded";
import BranchAdminBillingOnlyGuard from "@/components/branch/BranchAdminBillingOnlyGuard";
import { useNewOrdersCount } from "@/hooks/useNewOrdersCount";
import { useBranchEmailConfigured } from "@/hooks/useBranchEmailConfigured";

function EmailNotConfiguredBanner() {
  const { tenantId, branchId, membershipRole } = useTenantContext();
  const { data: configured, isLoading } = useBranchEmailConfigured(tenantId, branchId);
  if (!branchId || isLoading || configured !== false) return null;
  const isAdmin = membershipRole === "owner" || membershipRole === "admin";
  if (!isAdmin) return null;
  return (
    <div className="border-b px-4 py-2 text-sm flex items-center gap-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
      <Mail className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        No outgoing email is configured for this branch — invoices, quotes and order notifications
        will not be sent until you add a sender.
      </span>
      <Link to="/branch/settings?tab=email" className="underline font-medium">
        Configure email
      </Link>
    </div>
  );
}

function SubscriptionGateBanner() {
  const { branchId, membershipRole } = useTenantContext();
  const gate = useBranchSubscriptionGate(branchId);
  if (!branchId || gate.loading) return null;
  const isAdmin = membershipRole === "owner" || membershipRole === "admin";
  if (gate.state === "active" || gate.state === "trialing") return null;
  if (gate.state === "grace" && !isAdmin) return null;
  const tone =
    gate.state === "grace"
      ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
      : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200";
  const headline =
    gate.state === "grace"
      ? gate.reason
      : isAdmin
        ? `This branch is restricted — ${gate.reason} Only billing settings remain available.`
        : `This branch is read-only — ${gate.reason} New orders are disabled until the subscription is active.`;
  return (
    <div className={`border-b px-4 py-2 text-sm flex items-center gap-2 ${tone}`}>
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{headline}</span>
      <Link to="/branch/settings?tab=subscription" className="underline font-medium">
        Manage subscription
      </Link>
    </div>
  );
}

export default function BranchLayout() {
  const { tenantId, tenantName, branchId } = useTenantContext();
  useDocumentBranding(tenantId, tenantName, "Branch Portal");
  useEnsureBranchPricingSeeded(branchId);


  const { data: unreadMap = {} } = useUnreadMessagesStaff(tenantId, branchId);
  const totalUnread = useMemo(
    () => Object.values(unreadMap).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [unreadMap],
  );
  useDocumentTitleUnread(totalUnread);
  useMessageDesktopAlerts({ tenantId, branchId, ordersBasePath: "/branch/orders" });
  const newOrderCount = useNewOrdersCount(tenantId, branchId);


  return (
    <div className="flex h-screen w-full bg-background">
      <BranchSidebar unreadOrderCount={totalUnread} newOrderCount={newOrderCount} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center justify-between gap-2 border-b bg-background px-4">
          <BranchSwitcher />
          <StaffMessagesBell ordersBasePath="/branch/orders" />
        </header>
        <SubscriptionGateBanner />
        <EmailNotConfiguredBanner />
        <main className="flex-1 overflow-auto p-6">
          <BranchAdminBillingOnlyGuard />
        </main>
      </div>
    </div>
  );
}
