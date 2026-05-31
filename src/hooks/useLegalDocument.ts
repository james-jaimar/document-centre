import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch a tenant's legal document (terms or privacy) via the
 * SECURITY DEFINER `resolve_tenant_setting` RPC so anonymous
 * storefront visitors can read it without RLS friction.
 */
export function useLegalDocument(tenantId: string | null, kind: "terms" | "privacy") {
  const valueKey = kind === "terms" ? "terms_of_service" : "privacy_policy";
  const stampKey = kind === "terms" ? "terms_updated_at" : "privacy_updated_at";

  const query = useQuery({
    queryKey: ["legal-doc", tenantId, kind],
    enabled: !!tenantId,
    queryFn: async () => {
      const [val, stamp] = await Promise.all([
        supabase.rpc("resolve_tenant_setting", {
          p_tenant_id: tenantId!,
          p_category: "legal",
          p_key: valueKey,
        }),
        supabase.rpc("resolve_tenant_setting", {
          p_tenant_id: tenantId!,
          p_category: "legal",
          p_key: stampKey,
        }),
      ]);
      if (val.error) throw val.error;
      if (stamp.error) throw stamp.error;
      // RPC returns jsonb (string | null)
      const html = typeof val.data === "string" ? val.data : null;
      const updatedAt = typeof stamp.data === "string" ? stamp.data : null;
      return { html, updatedAt };
    },
  });

  return {
    html: query.data?.html ?? null,
    updatedAt: query.data?.updatedAt ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
