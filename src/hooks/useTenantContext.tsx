import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TenantMembership {
  id: string;
  app_id: string;
  tenant_id: string;
  branch_id: string | null;
  role: string;
  is_active: boolean;
  can_view_all_orders: boolean;
}

interface TenantContextValue {
  /** All active memberships for the current user */
  memberships: TenantMembership[];
  /** The "active" membership (first owner/admin, or first available) */
  activeMembership: TenantMembership | null;
  /** Convenience accessors from active membership */
  appId: string | null;
  tenantId: string | null;
  branchId: string | null;
  membershipRole: string | null;
  /** Tenant display name */
  tenantName: string | null;
  loading: boolean;
  /** Switch active membership (for multi-tenant users) */
  setActiveMembershipId: (id: string) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

const ROLE_PRIORITY = ["owner", "admin", "sales", "production", "accounts", "customer"];

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [activeMembershipId, setActiveMembershipId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMemberships([]);
      setActiveMembershipId(null);
      setTenantName(null);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select("id, app_id, tenant_id, branch_id, role, is_active, can_view_all_orders")
        .eq("profile_id", user.id)
        .eq("is_active", true);

      if (error) {
        console.error("Error fetching tenant memberships:", error);
        setLoading(false);
        return;
      }

      const ms = (data || []) as TenantMembership[];
      setMemberships(ms);

      // Pick the best membership (highest role priority)
      if (ms.length > 0) {
        const sorted = [...ms].sort(
          (a, b) => ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role)
        );
        setActiveMembershipId(sorted[0].id);

        // Fetch tenant name
        const { data: tenant } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", sorted[0].tenant_id)
          .single();
        setTenantName(tenant?.name ?? null);
      }

      setLoading(false);
    };

    load();
  }, [user]);

  const activeMembership = memberships.find((m) => m.id === activeMembershipId) ?? null;

  return (
    <TenantContext.Provider
      value={{
        memberships,
        activeMembership,
        appId: activeMembership?.app_id ?? null,
        tenantId: activeMembership?.tenant_id ?? null,
        branchId: activeMembership?.branch_id ?? null,
        membershipRole: activeMembership?.role ?? null,
        tenantName,
        loading,
        setActiveMembershipId,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenantContext must be used within a TenantProvider");
  }
  return context;
}
