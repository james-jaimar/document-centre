import { Outlet } from "react-router-dom";
import CustomerSidebar from "@/components/CustomerSidebar";
import CustomerHeader from "@/components/CustomerHeader";
import CustomerFooter from "@/components/CustomerFooter";
import { Menu, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useMemo, useEffect, useRef } from "react";
import { SidebarCollapseProvider, useSidebarCollapse } from "@/hooks/useSidebarCollapse";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import ChatWidget from "@/components/ChatWidget";


// Convert a hex colour to "H S% L%" for CSS variable injection
function hexToHslString(hex: string | undefined | null): string | null {
  if (!hex) return null;
  const m = hex.trim().replace("#", "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function CustomerLayoutInner() {
  const { user, loading: authLoading } = useAuth();
  const { slug } = useTenantSlug();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapse();
  const { tenant } = useTenantFromSlug();
  const { data: branding, isLoading: brandingLoading } = useTenantBranding(tenant?.id ?? null);
  // True once branding has resolved (or there's no tenant to load for)
  const brandingReady = !tenant?.id || !brandingLoading;

  // --- Anonymous session bootstrap ---
  const bootstrapAttempted = useRef(false);

  useEffect(() => {
    // Only run on tenant portal routes, not /try or /dashboard
    if (!slug || authLoading || bootstrapAttempted.current) return;

    // If already signed in, no need to bootstrap
    if (user) {
      bootstrapAttempted.current = true;
      return;
    }

    bootstrapAttempted.current = true;

    (async () => {
      try {
        // Check for existing session first
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing?.user) {
          // Already have a session — call tenant-bootstrap as fallback
          await supabase.functions.invoke("tenant-bootstrap", {
            body: { tenant_slug: slug },
          }).catch(() => null);
          return;
        }

        // Create anonymous session scoped to this tenant
        const { error: signInErr } = await supabase.auth.signInAnonymously({
          options: { data: { tenant_slug: slug } },
        });
        if (signInErr) throw signInErr;

        // Belt-and-braces: ensure membership via edge function
        await supabase.functions.invoke("tenant-bootstrap", {
          body: { tenant_slug: slug },
        }).catch((e) => console.warn("tenant-bootstrap warning:", e));
      } catch (e: any) {
        console.error("Anonymous session bootstrap failed:", e);
      }
    })();
  }, [slug, user, authLoading]);


  // Inject tenant colour + font CSS variables for the print centre
  const tenantStyle = useMemo(() => {
    const style: Record<string, string> = {};
    const primary = hexToHslString(branding?.primary_color);
    const accent = hexToHslString(branding?.accent_color);
    const secondary = hexToHslString(branding?.secondary_color);
    if (primary) style["--tenant-primary"] = primary;
    if (accent) style["--tenant-accent"] = accent;
    if (secondary) style["--tenant-secondary"] = secondary;
    if (branding?.font_heading) style["--tenant-font-heading"] = branding.font_heading;
    if (branding?.font_body) style["--tenant-font-body"] = branding.font_body;
    return style as React.CSSProperties;
  }, [branding]);


  return (
    <div className="flex h-screen w-full flex-col" style={tenantStyle}>
      {/* Header — full width across the top */}
      <CustomerHeader />

      {/* Sidebar + main content row */}
      <div className="flex flex-1 w-full min-h-0">
        {/* Desktop sidebar — animated collapse */}
        <div
          className={`hidden lg:flex transition-all duration-300 ease-in-out overflow-hidden ${
            collapsed ? "w-0" : "w-64"
          } ${brandingReady ? "opacity-100" : "opacity-0"}`}
        >
          <CustomerSidebar />
        </div>

        {/* Collapse toggle tab — visible when sidebar is collapsed */}
        {collapsed && (
          <button
            onClick={toggle}
            className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-6 h-16 rounded-r-lg bg-sidebar border border-l-0 border-sidebar-border shadow-md hover:w-8 transition-all duration-200 group"
            title="Open sidebar"
          >
            <PanelLeftOpen className="h-4 w-4 text-sidebar-foreground/70 group-hover:text-sidebar-foreground transition-colors" />
          </button>
        )}

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <div
              className="print-sidebar w-64 h-full px-5 py-6 flex"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Mobile menu trigger row */}
          <div className="lg:hidden flex items-center border-b border-border bg-white/80">
            <button
              className="self-stretch px-4 py-2 hover:bg-secondary"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <main className="flex-1 overflow-auto customer-body p-6 xl:p-8">
            <Outlet />
          </main>

          {/* Footer */}
          <CustomerFooter />
        </div>
      </div>
      <ChatWidget />
    </div>
  );
}

export default function CustomerLayout() {
  return (
    <SidebarCollapseProvider>
      <CustomerLayoutInner />
    </SidebarCollapseProvider>
  );
}
