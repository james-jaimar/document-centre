import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setDocumentCentreContext } from "@/lib/documentCentreApi";

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
  /** Platform admin: override to view a different tenant */
  overrideTenantId: string | null;
  isOverriding: boolean;
  setOverrideTenantId: (id: string | null) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

const ROLE_PRIORITY = ["owner", "admin", "sales", "production", "accounts", "customer"];

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const location = useLocation();
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [activeMembershipId, setActiveMembershipId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Platform admin override state
  const [overrideTenantId, setOverrideTenantIdState] = useState<string | null>(null);
  const [overrideAppId, setOverrideAppId] = useState<string | null>(null);
  const [overrideTenantName, setOverrideTenantName] = useState<string | null>(null);

  const isPlatformAdmin = roles.includes("platform_admin");

  // Pick up ?tenant= param when navigating to /admin
  useEffect(() => {
    if (!isPlatformAdmin) return;
    const params = new URLSearchParams(location.search);
    const tenantParam = params.get("tenant");
    if (tenantParam && tenantParam !== overrideTenantId) {
      setOverrideTenantIdState(tenantParam);
    }
  }, [location.search, isPlatformAdmin]);

  // Fetch override tenant details
  useEffect(() => {
    if (!overrideTenantId) {
      setOverrideAppId(null);
      setOverrideTenantName(null);
      return;
    }

    const fetchOverride = async () => {
      const { data } = await supabase
        .from("tenants")
        .select("app_id, name")
        .eq("id", overrideTenantId)
        .single();
      if (data) {
        setOverrideAppId(data.app_id);
        setOverrideTenantName(data.name);
      }
    };
    fetchOverride();
  }, [overrideTenantId]);

  const setOverrideTenantId = useCallback((id: string | null) => {
    setOverrideTenantIdState(id);
  }, []);

  // Key membership loading off the stable user id, NOT the user object reference.
  // Supabase emits a new user object on every silent token refresh, which would
  // otherwise re-trigger this effect and blank the UI via the loading flag.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
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
        .eq("profile_id", userId)
        .eq("is_active", true);

      if (error) {
        console.error("Error fetching tenant memberships:", error);
        setLoading(false);
        return;
      }

      const ms = (data || []) as TenantMembership[];
      setMemberships(ms);

      if (ms.length > 0) {
        const sorted = [...ms].sort(
          (a, b) => ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role)
        );
        setActiveMembershipId(sorted[0].id);

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
  }, [userId]);

  const activeMembership = memberships.find((m) => m.id === activeMembershipId) ?? null;

  const isOverriding = isPlatformAdmin && !!overrideTenantId;

  // When overriding, use override values; otherwise use membership values
  const effectiveTenantId = isOverriding ? overrideTenantId : (activeMembership?.tenant_id ?? null);
  const effectiveAppId = isOverriding ? overrideAppId : (activeMembership?.app_id ?? null);
  const effectiveTenantName = isOverriding ? overrideTenantName : tenantName;

  // Forward tenant + app context to the Document Centre client so
  // every backend op (print-ready, inspect, …) is attributed in JobEvents.
  useEffect(() => {
    setDocumentCentreContext({ tenantId: effectiveTenantId, appId: effectiveAppId });
  }, [effectiveTenantId, effectiveAppId]);

  return (
    <TenantContext.Provider
      value={{
        memberships,
        activeMembership,
        appId: effectiveAppId,
        tenantId: effectiveTenantId,
        branchId: activeMembership?.branch_id ?? null,
        membershipRole: activeMembership?.role ?? null,
        tenantName: effectiveTenantName,
        loading,
        setActiveMembershipId,
        overrideTenantId,
        isOverriding,
        setOverrideTenantId,
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
