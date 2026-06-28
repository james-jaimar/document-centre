import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useDemoGateConfig, useDemoUnlock } from "@/hooks/useDemoGate";
import DemoGatePage from "./DemoGatePage";

/**
 * Wraps the tenant-facing routes. If the tenant has Demo Mode enabled,
 * visitors must enter the shared password and accept the disclaimer
 * before they can see anything. Platform admins and tenant staff bypass.
 */
export default function DemoGateGuard({ children }: { children: ReactNode }) {
  const { slug } = useTenantSlug();
  const { user, roles } = useAuth();
  const { memberships } = useTenantContext();

  const { data: tenant } = useQuery({
    queryKey: ["demo-gate-tenant", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const tenantId = tenant?.id ?? null;
  const { data: config, isLoading } = useDemoGateConfig(tenantId);
  const { unlocked, unlock } = useDemoUnlock(tenantId);

  const isPlatformAdmin = roles?.includes("platform_admin");
  const isTenantStaff =
    !!user && !!tenantId && memberships.some((m) => m.tenant_id === tenantId);

  if (!tenantId || isLoading) return <>{children}</>;
  if (!config?.enabled) return <>{children}</>;
  if (isPlatformAdmin || isTenantStaff) return <>{children}</>;
  if (unlocked) return <>{children}</>;

  return (
    <DemoGatePage
      tenantId={tenantId}
      tenantName={tenant?.name}
      config={config}
      onUnlock={unlock}
    />
  );
}
