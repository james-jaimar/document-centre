import { createContext, useContext, useEffect, useLayoutEffect, useState, useCallback, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setDocumentCentreContext } from "@/lib/documentCentreApi";
import { TenantSlugContext } from "@/contexts/TenantSlugContext";
import { setStorefrontTenantId } from "@/lib/storefrontTenantHeader";


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

  // -----------------------------------------------------------------
  // URL-slug tenant resolution (customer portal: /t/:slug/... OR
  // {slug}.document-centre.com subdomain via TenantSlugContext).
  // -----------------------------------------------------------------
  const slugContext = useContext(TenantSlugContext);
  const urlSlugMatch = location.pathname.match(/^\/t\/([^/]+)/);
  const urlSlug = slugContext?.slug ?? (urlSlugMatch ? urlSlugMatch[1] : null);

  const [slugTenant, setSlugTenant] = useState<{
    id: string;
    app_id: string;
    name: string;
    slug: string;
  } | null>(null);
  const [slugLoading, setSlugLoading] = useState(false);

  useEffect(() => {
    if (!urlSlug) {
      setSlugTenant(null);
      setSlugLoading(false);
      return;
    }
    // If we already resolved this slug, skip
    if (slugTenant && slugTenant.slug === urlSlug) return;
    setSlugLoading(true);
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, app_id, name, slug")
        .eq("slug", urlSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setSlugTenant(null);
      } else {
        setSlugTenant(data as { id: string; app_id: string; name: string; slug: string });
      }
      setSlugLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [urlSlug, slugTenant]);

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

  // -----------------------------------------------------------------
  // Effective tenant resolution priority:
  //   1. URL slug (customer portal /t/:slug)  — ALWAYS wins to prevent
  //      cross-tenant leakage when a signed-in user has memberships in
  //      another tenant.
  //   2. Platform admin override (?tenant=...)
  //   3. Active membership
  // -----------------------------------------------------------------
  const slugMembership = slugTenant
    ? memberships.find((m) => m.tenant_id === slugTenant.id && m.is_active) ?? null
    : null;

  const effectiveTenantId = slugTenant
    ? slugTenant.id
    : isOverriding
    ? overrideTenantId
    : activeMembership?.tenant_id ?? null;

  const effectiveAppId = slugTenant
    ? slugTenant.app_id
    : isOverriding
    ? overrideAppId
    : activeMembership?.app_id ?? null;

  const effectiveTenantName = slugTenant
    ? slugTenant.name
    : isOverriding
    ? overrideTenantName
    : tenantName;

  // Branch + role: only meaningful when the user has a membership in the
  // *effective* tenant. On a foreign storefront they have no role.
  const effectiveBranchId = slugTenant
    ? slugMembership?.branch_id ?? null
    : activeMembership?.branch_id ?? null;
  const effectiveRole = slugTenant
    ? slugMembership?.role ?? null
    : activeMembership?.role ?? null;

  const effectiveLoading = loading || (!!urlSlug && slugLoading);

  // Forward tenant + app context to the Document Centre client so
  // every backend op (print-ready, inspect, …) is attributed in JobEvents.
  useEffect(() => {
    setDocumentCentreContext({ tenantId: effectiveTenantId, appId: effectiveAppId });
  }, [effectiveTenantId, effectiveAppId]);

  // Publish the URL-resolved storefront tenant so the global fetch
  // interceptor can attach `x-storefront-tenant` to every PostgREST
  // request. Only set when we're on a /t/:slug or subdomain route —
  // never on /admin or /platform. Use useLayoutEffect so the header
  // is in place before child providers commit their first fetches.
  useLayoutEffect(() => {
    setStorefrontTenantId(slugTenant?.id ?? null);
  }, [slugTenant?.id]);



  return (
    <TenantContext.Provider
      value={{
        memberships,
        activeMembership,
        appId: effectiveAppId,
        tenantId: effectiveTenantId,
        branchId: effectiveBranchId,
        membershipRole: effectiveRole,
        tenantName: effectiveTenantName,
        loading: effectiveLoading,
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
