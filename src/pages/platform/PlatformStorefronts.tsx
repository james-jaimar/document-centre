import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenants } from "@/hooks/useTenants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Store } from "lucide-react";
import { STOREFRONT_PAGES_DEFAULTS, type StorefrontPagesConfig } from "@/hooks/useStorefrontPages";

function useAllStorefrontConfigs() {
  return useQuery({
    queryKey: ["storefront_configs_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("tenant_id, setting_value")
        .eq("category", "storefront")
        .eq("setting_key", "config");
      if (error) throw error;
      const map: Record<string, StorefrontPagesConfig> = {};
      (data ?? []).forEach((row: any) => {
        map[row.tenant_id] = {
          ...STOREFRONT_PAGES_DEFAULTS,
          ...(row.setting_value ?? {}),
          pages: {
            ...STOREFRONT_PAGES_DEFAULTS.pages,
            ...((row.setting_value ?? {}).pages ?? {}),
          },
        };
      });
      return map;
    },
  });
}

export default function PlatformStorefronts() {
  const { data: tenants, isLoading } = useTenants();
  const { data: configs } = useAllStorefrontConfigs();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Store className="h-6 w-6" aria-hidden />
          Storefronts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Custom ecommerce pages per tenant — enable them and edit all page content here.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Tenant</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Pages</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(tenants ?? []).map((t) => {
                const cfg = configs?.[t.id];
                const enabled = !!cfg?.enabled;
                const pages = cfg
                  ? Object.entries(cfg.pages)
                      .filter(([, on]) => on)
                      .map(([k]) => k)
                  : [];
                return (
                  <tr key={t.id} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">/t/{t.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={enabled ? "default" : "secondary"}>
                        {enabled ? "On" : "Off"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {enabled && pages.length ? pages.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <a href={`/t/${t.slug}`} target="_blank" rel="noreferrer">
                            Open <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button asChild size="sm">
                          <Link to={`/platform/storefronts/${t.id}`}>Manage</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
