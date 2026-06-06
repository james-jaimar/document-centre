import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PLATFORM_DOMAIN = "document-centre.com";

interface HostTenant {
  id: string;
  slug: string;
  name: string;
  app_id: string;
}

/**
 * Resolves a tenant from the current hostname.
 *
 * Supports:
 * 1. {slug}.document-centre.com — extract slug and look up tenant
 * 2. Custom domains stored in tenants.custom_domain
 * 3. Returns null if no match (fall through to path-based /t/:slug routing)
 */
export function useTenantFromHost() {
  const [tenant, setTenant] = useState<HostTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    const rawHost = window.location.hostname;
    const hostname = rawHost.replace(/^www\./, "");

    // Skip localhost, preview domains, and the bare platform domain
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".lovable.app") ||
      hostname.endsWith(".lovable.dev") ||
      hostname.endsWith(".jaimar.dev") ||
      hostname === PLATFORM_DOMAIN
    ) {
      setLoading(false);
      return;
    }

    const runOnce = async () => {
      // Platform subdomain: {slug}.document-centre.com
      if (hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
        const slug = hostname.replace(`.${PLATFORM_DOMAIN}`, "");
        if (slug && !slug.includes(".")) {
          const { data } = await supabase
            .from("tenants")
            .select("id, slug, name, app_id")
            .eq("slug", slug)
            .eq("is_active", true)
            .maybeSingle();
          if (data) {
            setTenant(data as HostTenant);
            setMatched(true);
          }
        }
        return;
      }

      // Custom domain (apex or www. form)
      const candidates = Array.from(new Set([rawHost, hostname]));
      const { data } = await supabase
        .from("tenants")
        .select("id, slug, name, app_id")
        .in("custom_domain", candidates)
        .eq("is_active", true)
        .maybeSingle();
      if (data) {
        setTenant(data as HostTenant);
        setMatched(true);
      }
    };

    const resolve = async () => {
      setLoading(true);
      const backoffs = [0, 250, 750, 1500];
      let lastErr: unknown = null;
      for (let i = 0; i < backoffs.length; i++) {
        if (backoffs[i] > 0) await new Promise((r) => setTimeout(r, backoffs[i]));
        try {
          await runOnce();
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (lastErr) console.warn("[useTenantFromHost] tenant lookup failed after retries", lastErr);
      setLoading(false);
    };

    resolve();
  }, []);

  return { tenant, loading, matched };
}

