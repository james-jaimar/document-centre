import { Link, useParams } from "react-router-dom";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Phone } from "lucide-react";

export default function CustomerFooter() {
  const { slug } = useParams<{ slug: string }>();
  const { tenant } = useTenantFromSlug();
  const { data: branding } = useTenantBranding(tenant?.id ?? null);

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
  const tenantName = branding?.portal_name || tenant?.name || "Print Centre";
  const logoUrl = branding?.logo_url || tenant?.logo_url || "";
  const isDemo = (tenant?.slug ?? slug) === "demo" || tenantName.toLowerCase().includes("document centre");

  const base = `/t/${slug}`;
  const navItems = [
    { to: `${base}/print-centre`, label: "Home" },
    { to: `${base}/orders/new`, label: "Create an Order" },
    { to: `${base}/orders`, label: "My Orders" },
    { to: `${base}/account`, label: "My Account" },
  ];

  return (
    <footer className="border-t border-border bg-white px-6 py-5 lg:px-10">
      <div className="mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left: tenant brand + copyright */}
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt={tenantName} className="h-7 w-auto max-w-[120px] object-contain opacity-90" />
          ) : null}
          <span className="text-xs text-muted-foreground">© {year} {tenantName}</span>
        </div>

        {/* Centre: nav + support */}
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ))}
          {support?.support_email && (
            <a
              href={`mailto:${support.support_email}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              {support.support_email}
            </a>
          )}
          {support?.support_phone && (
            <a
              href={`tel:${support.support_phone}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              {support.support_phone}
            </a>
          )}
        </nav>

        {/* Right: legal + powered-by */}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Link to={`${base}/terms`} className="hover:text-foreground transition-colors">Terms</Link>
          <Link to={`${base}/privacy`} className="hover:text-foreground transition-colors">Privacy</Link>
          {!isDemo && (
            <a
              href="https://document-centre.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Powered by Document Centre
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
