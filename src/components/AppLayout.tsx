import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useDocumentBranding } from "@/hooks/useDocumentBranding";

export default function AppLayout() {
  const { tenantId, tenantName } = useTenantContext();
  useDocumentBranding(tenantId, tenantName, "Admin");

  return (
    <div className="flex h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
