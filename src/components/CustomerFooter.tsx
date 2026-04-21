import { Link, useParams } from "react-router-dom";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function CustomerFooter() {
  const { slug } = useParams<{ slug: string }>();
  const { tenant } = useTenantFromSlug();

  // Pull general support contact details from tenant_settings, if any
  const { data: support } = useQuery({
    queryKey: ["tenant_support", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_settings")
        .select("setting_key, setting_value")
        .eq("tenant_id", tenant!.id)
        .eq("category", "general")
        .in("setting_key", ["support_email", "support_phone"]);
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const v = row.setting_value as unknown;
        if (typeof v === "string") map[row.setting_key] = v;
      }
      return map;
    },
  });

  const year = new Date().getFullYear();
  const tenantName = tenant?.name || "Print Centre";
  const isDocumentCentre = (tenant?.slug ?? slug) === "demo" || tenantName.toLowerCase().includes("document centre");

  return (
    <footer className="border-t border-border bg-white/80 px-6 py-3 text-xs text-muted-foreground backdrop-blur">
      <div className="mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>© {year} {tenantName}</span>
          {!isDocumentCentre && (
            <>
              <span aria-hidden>·</span>
              <a
                href="https://document-centre.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Powered by Document Centre
              </a>
            </>
          )}
        </div>

        {(support?.support_email || support?.support_phone) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {support?.support_email && (
              <a href={`mailto:${support.support_email}`} className="hover:text-foreground">
                {support.support_email}
              </a>
            )}
            {support?.support_phone && (
              <a href={`tel:${support.support_phone}`} className="hover:text-foreground">
                {support.support_phone}
              </a>
            )}
          </div>
        )}

        <div className="flex items-center gap-x-3">
          <Link to={`/t/${slug}/terms`} className="hover:text-foreground">Terms</Link>
          <span aria-hidden>·</span>
          <Link to={`/t/${slug}/privacy`} className="hover:text-foreground">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
