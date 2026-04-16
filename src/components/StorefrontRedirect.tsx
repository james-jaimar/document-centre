import { Navigate, useLocation } from "react-router-dom";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Redirects /dashboard → /t/{tenant-slug}/dashboard
 * for logged-in users with an active tenant membership.
 */
export function StorefrontRedirect({ path = "dashboard" }: { path?: string }) {
  const { tenantId, loading: ctxLoading } = useTenantContext();
  const location = useLocation();
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const targetPath = path || location.pathname.replace(/^\/dashboard\/?/, "") || "dashboard";

  useEffect(() => {
    if (ctxLoading) return;
    if (!tenantId) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", tenantId)
        .maybeSingle();
      setSlug(data?.slug ?? null);
      setLoading(false);
    })();
  }, [tenantId, ctxLoading]);

  if (loading || ctxLoading) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading…</div>;
  }

  if (slug) {
    return (
      <Navigate
        to={{
          pathname: `/t/${slug}/${targetPath}`,
          search: location.search,
          hash: location.hash,
        }}
        replace
      />
    );
  }

  // No tenant membership — show a message or redirect to auth
  return <Navigate to="/auth" replace />;
}
