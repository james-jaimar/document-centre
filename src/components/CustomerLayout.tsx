import { Outlet, useNavigate } from "react-router-dom";
import CustomerSidebar from "@/components/CustomerSidebar";
import CustomerHeader from "@/components/CustomerHeader";
import CustomerFooter from "@/components/CustomerFooter";
import { Menu, PanelLeftOpen, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useMemo } from "react";
import { SidebarCollapseProvider, useSidebarCollapse } from "@/hooks/useSidebarCollapse";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";

function DemoBanner({ onUpgrade }: { onUpgrade: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-300/60 bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 px-4 py-2.5 text-sm text-amber-900">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="h-4 w-4 shrink-0 text-amber-700" />
        <span className="truncate">
          <strong>Demo mode</strong> — explore the full ordering flow. No real orders are placed.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onUpgrade}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
        >
          Save my work — start free trial
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 hover:bg-amber-200/60"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapse();
  const { tenant } = useTenantFromSlug();
  const { data: branding } = useTenantBranding(tenant?.id ?? null);

  const { data: profile } = useQuery({
    queryKey: ["profile_demo_flag", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("profiles").select("is_demo").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const isDemo = !!profile?.is_demo;

  // Inject tenant colour CSS variables for the print centre
  const tenantStyle = useMemo(() => {
    const style: Record<string, string> = {};
    const primary = hexToHslString(branding?.primary_color);
    const accent = hexToHslString(branding?.accent_color);
    const secondary = hexToHslString(branding?.secondary_color);
    if (primary) style["--tenant-primary"] = primary;
    if (accent) style["--tenant-accent"] = accent;
    if (secondary) style["--tenant-secondary"] = secondary;
    return style as React.CSSProperties;
  }, [branding]);

  return (
    <div className="flex h-screen w-full flex-col" style={tenantStyle}>
      {isDemo && <DemoBanner onUpgrade={() => navigate("/auth?mode=register&from=demo")} />}
      <div className="flex flex-1 w-full min-h-0">
        {/* Desktop sidebar — animated collapse */}
        <div
          className={`hidden lg:flex transition-all duration-300 ease-in-out overflow-hidden ${
            collapsed ? "w-0" : "w-64"
          }`}
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
          {/* Top bar — mobile menu trigger + header */}
          <div className="flex items-stretch">
            <button
              className="lg:hidden self-stretch px-4 hover:bg-secondary"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5 text-muted-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <CustomerHeader />
            </div>
          </div>

          {/* Content */}
          <main className="flex-1 overflow-auto customer-body p-6 xl:p-8">
            <Outlet />
          </main>

          {/* Footer */}
          <CustomerFooter />
        </div>
      </div>
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
