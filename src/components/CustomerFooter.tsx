import { Link } from "react-router-dom";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Phone, MapPin } from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";

export default function CustomerFooter() {
  const { slug, tenantPath } = useTenantSlug();
  const { tenant } = useTenantFromSlug();
  const { data: branding } = useTenantBranding(tenant?.id ?? null);
  const { activeBranch } = useBranch();

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
        .in("setting_key", ["support_email", "support_phone", "terms_url", "privacy_url"]);
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
  const isDemo = slug === "demo" || tenantName.toLowerCase().includes("document centre");

  const navItems = [
    { to: tenantPath("print-centre"), label: "Home" },
    { to: tenantPath("orders/new"), label: "Create an Order" },
    { to: tenantPath("orders"), label: "My Orders" },
    { to: tenantPath("account"), label: "My Account" },
  ];

  // Prefer branch contact when a branch is selected, else fall back to tenant settings
  const contactEmail = (activeBranch as any)?.email || support?.support_email || "";
  const contactPhone = (activeBranch as any)?.phone || support?.support_phone || "";
  const contactAddress = (activeBranch as any)?.address || "";

  return (
    <footer className="border-t border-border bg-white px-6 py-5 lg:px-10">
      <div className="mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left: tenant brand + branch + copyright */}
        <div className="flex items-center gap-3 min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt={tenantName} className="h-7 w-auto max-w-[120px] object-contain opacity-90" />
          ) : null}
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-muted-foreground">© {year} {activeBranch?.name ?? tenantName}</span>
            {contactAddress && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 truncate max-w-[420px]">
                <MapPin className="h-3 w-3 shrink-0" />
                {contactAddress}
              </span>
            )}
          </div>
        </div>

        {/* Centre: nav + branch contact */}
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ))}
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              {contactEmail}
            </a>
          )}
          {contactPhone && (
            <a
              href={`tel:${contactPhone}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              {contactPhone}
            </a>
          )}
        </nav>

        {/* Right: legal + powered-by */}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {support?.terms_url ? (
            <a href={support.terms_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Terms</a>
          ) : (
            <Link to={tenantPath("terms")} className="hover:text-foreground transition-colors">Terms</Link>
          )}
          {support?.privacy_url ? (
            <a href={support.privacy_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Privacy</a>
          ) : (
            <Link to={tenantPath("privacy")} className="hover:text-foreground transition-colors">Privacy</Link>
          )}
          {!isDemo && (() => {
            const host = typeof window !== "undefined" ? window.location.hostname : "";
            const isPlatformHost =
              host === "document-centre.com" ||
              host.endsWith(".document-centre.com") ||
              host.endsWith(".lovable.app") ||
              host.endsWith(".lovable.dev") ||
              host.endsWith(".jaimar.dev") ||
              host === "localhost" ||
              host === "127.0.0.1";
            if (!isPlatformHost) return null;
            return (
              <a
                href="https://document-centre.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Powered by Document Centre
              </a>
            );
          })()}
        </div>
      </div>
    </footer>
  );
}
