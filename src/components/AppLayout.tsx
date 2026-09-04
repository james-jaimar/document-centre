import { useMemo } from "react";
import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useDocumentBranding } from "@/hooks/useDocumentBranding";
import StaffMessagesBell from "@/components/staff/StaffMessagesBell";
import { useUnreadMessagesStaff } from "@/hooks/useUnreadMessages";
import { useDocumentTitleUnread } from "@/hooks/useDocumentTitleUnread";
import { useMessageDesktopAlerts } from "@/hooks/useMessageDesktopAlerts";
import { buildAdminPath } from "@/lib/adminRouting";

export default function AppLayout() {
  const { tenantId, tenantName, branchId } = useTenantContext();
  useDocumentBranding(tenantId, tenantName, "Admin");
  const { data: unreadMap = {} } = useUnreadMessagesStaff(tenantId, branchId);
  const totalUnread = useMemo(
    () => Object.values(unreadMap).reduce((sum, n) => sum + (Number(n) || 0), 0),
    [unreadMap],
  );
  useDocumentTitleUnread(totalUnread);
  useMessageDesktopAlerts({
    tenantId,
    branchId,
    ordersBasePath: buildAdminPath("/admin/orders", tenantId),
  });


  return (
    <div className="flex h-screen w-full bg-background">
      <AppSidebar unreadOrderCount={totalUnread} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center justify-end gap-2 border-b bg-background px-4">
          <StaffMessagesBell ordersBasePath={buildAdminPath("/admin/orders", tenantId)} />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
