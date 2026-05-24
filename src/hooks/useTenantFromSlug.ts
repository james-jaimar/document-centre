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

const CACHE_PREFIX = "tenant:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function readCache(slug: string): SlugTenant | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + slug);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data as SlugTenant;
  } catch {
    return null;
  }
}

function writeCache(slug: string, data: SlugTenant) {
  try {
    localStorage.setItem(CACHE_PREFIX + slug, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* ignore quota errors */
  }
}

export function useTenantFromSlug() {
  const { slug } = useTenantSlug();
  // Hydrate immediately from cache so the first paint is branded.
  const [tenant, setTenant] = useState<SlugTenant | null>(() =>
    slug ? readCache(slug) : null,
  );
  const [loading, setLoading] = useState(() => !!slug && !readCache(slug));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    // If we already painted from cache, revalidate quietly in the background.
    const cached = readCache(slug);
    if (cached) {
      setTenant(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    (async () => {
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
        writeCache(slug, data as SlugTenant);
      }
      setLoading(false);
    })();
  }, [slug]);

  return { tenant, slug, loading, error };
}
