import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useSubdomainTenant } from "@/components/SubdomainRouter";
import { useDemoGateConfig, useDemoUnlock } from "@/hooks/useDemoGate";
import DemoGateModal from "./DemoGateModal";

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
  const { tenantId: ctxTenantId, tenantName: ctxTenantName, memberships, loading: tenantLoading } = useTenantContext();
  const sub = useSubdomainTenant();

  // Only fall back to a direct lookup when neither context has a tenant id yet.
  const needsFallback = !ctxTenantId && !sub.matched;
  const { data: fallbackTenant, isLoading: fallbackLoading } = useQuery({
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

  const tenantId = sub.tenantId ?? ctxTenantId ?? fallbackTenant?.id ?? null;
  // Best-effort display name (only used by the gate page header)
  const tenantName = sub.name ?? ctxTenantName ?? fallbackTenant?.name ?? null;

  const { data: config, isLoading, isError } = useDemoGateConfig(tenantId);
  const { unlocked, unlock } = useDemoUnlock(tenantId);

  const isPlatformAdmin = roles?.includes("platform_admin");
  const staffRoles = new Set([
    "owner",
    "admin",
    "sales",
    "production",
    "accounts",
    "branch_manager",
    "store_operator",
  ]);
  const isTenantStaff =
    !!user &&
    !!tenantId &&
    memberships.some((m) => m.tenant_id === tenantId && staffRoles.has(m.role));

  const expectsTenant = sub.matched || !!slug;
  if (expectsTenant && (!tenantId || tenantLoading || fallbackLoading || isLoading)) {
    return <DemoGateLoading />;
  }

  if (expectsTenant && isError) {
    return <DemoGateUnavailable />;
  }

  if (!tenantId) return <>{children}</>;
  if (!config?.enabled) return <>{children}</>;
  if (isPlatformAdmin || isTenantStaff) return <>{children}</>;
  if (unlocked) return <>{children}</>;

  return (
    <>
      {children}
      <DemoGateModal
        tenantName={tenantName}
        config={config}
        onAccept={() => unlock(config.cookie_days)}
      />
    </>
  );
}

function DemoGateLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function DemoGateUnavailable() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold">Private preview unavailable</h1>
        <p className="text-sm text-muted-foreground">
          We could not verify access to this preview. Please refresh the page.
        </p>
      </div>
    </div>
  );
}
