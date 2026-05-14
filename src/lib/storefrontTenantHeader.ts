/**
 * Global fetch interceptor that attaches `x-storefront-tenant: <uuid>`
 * to every Supabase PostgREST request whenever `TenantProvider` has
 * resolved a storefront tenant from the URL slug or subdomain.
 *
 * The DB function `current_storefront_tenant_id()` reads this header
 * and RLS policies on tenant-scoped tables enforce that storefront
 * queries can only see rows belonging to that tenant — making
 * cross-tenant leakage impossible at the database layer.
 *
 * On admin/platform routes the global is null and no header is sent,
 * so existing membership-based RLS continues to apply unchanged.
 */
declare global {
  interface Window {
    __storefrontTenantId: string | null;
  }
}

let installed = false;

export function installStorefrontTenantHeader(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const tenantId = window.__storefrontTenantId ?? null;
    if (!tenantId) return originalFetch(input as RequestInfo, init);

    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url;

    // Only attach to Supabase REST + Realtime calls. Edge Functions and
    // third-party calls are out of scope for this header.
    if (!supabaseUrl || !url.startsWith(supabaseUrl)) {
      return originalFetch(input as RequestInfo, init);
    }
    if (!url.includes("/rest/v1/") && !url.includes("/realtime/v1/")) {
      return originalFetch(input as RequestInfo, init);
    }

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-storefront-tenant", tenantId);
    return originalFetch(input as RequestInfo, { ...init, headers });
  };
}
