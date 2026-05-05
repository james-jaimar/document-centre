import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantSlug } from "@/hooks/useTenantSlug";

interface SlugTenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  custom_domain: string | null;
  is_demo: boolean;
}

export function useTenantFromSlug() {
  const { slug } = useTenantSlug();
  const [tenant, setTenant] = useState<SlugTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("tenants")
        .select("id, name, slug, logo_url, custom_domain, is_demo")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (err) {
        setError(err.message);
      } else if (!data) {
        setError("Storefront not found");
      } else {
        setTenant(data as SlugTenant);
      }
      setLoading(false);
    })();
  }, [slug]);

  return { tenant, slug, loading, error };
}
