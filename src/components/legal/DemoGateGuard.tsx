import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useSubdomainTenant } from "@/components/SubdomainRouter";
import { useDemoGateConfig, useDemoUnlock } from "@/hooks/useDemoGate";
import DemoGatePage from "./DemoGatePage";

/**
 * Wraps the tenant-facing routes. If the tenant has Demo Mode enabled,
 * visitors must enter the shared password and accept the disclaimer
 * before they can see anything. Platform admins and tenant staff bypass.
 *
 * Tenant id is sourced from (in priority order):
 *   1. useTenantContext  — works for both /t/:slug and host-resolved routing
 *   2. useSubdomainTenant — covers custom domains / {slug}.document-centre.com
 *      before TenantContext has settled
 *   3. a fallback tenants lookup by slug (path-based first paint)
 */
export default function DemoGateGuard({ children }: { children: ReactNode }) {
  const { slug } = useTenantSlug();
  const { user, roles } = useAuth();
  const { tenantId: ctxTenantId, memberships } = useTenantContext();
  const sub = useSubdomainTenant();

  // Only fall back to a direct lookup when neither context has a tenant id yet.
  const needsFallback = !ctxTenantId && !sub.matched;
  const { data: fallbackTenant } = useQuery({
    queryKey: ["demo-gate-tenant-fallback", slug],
    enabled: needsFallback && !!slug,
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

  const tenantId = ctxTenantId ?? fallbackTenant?.id ?? null;
  // Best-effort display name (only used by the gate page header)
  const tenantName = fallbackTenant?.name ?? null;

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
      tenantName={tenantName}
      config={config}
      onUnlock={unlock}
    />
  );
}
