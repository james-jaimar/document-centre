import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Home,
  Plus,
  ClipboardList,
  Settings,
  HelpCircle,
  PanelLeftClose,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse";
import { useCartItemCount } from "@/hooks/useCart";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { resolveDisplayName, resolveInitials } from "@/lib/displayName";

const buildNavItems = (slug: string) => [
  { to: `/t/${slug}/print-centre`, icon: Home, label: "Home", exact: true },
  { to: `/t/${slug}/orders/new`, icon: Plus, label: "Create", exact: false },
  { to: `/t/${slug}/orders`, icon: ClipboardList, label: "Orders", exact: false },
  { to: `/t/${slug}/cart`, icon: ShoppingCart, label: "Cart", exact: false, badge: true },
  { to: `/t/${slug}/account`, icon: Settings, label: "My Account", exact: false },
];

export default function CustomerSidebar() {
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };
  const cartCount = useCartItemCount();
  const navItems = buildNavItems(slug ?? "");
  const { tenant } = useTenantFromSlug();
  const { data: branding } = useTenantBranding(tenant?.id ?? null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, first_name, last_name, email")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const isActive = (path: string, exact: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const nameSource = { ...(profile ?? {}), email: profile?.email ?? user?.email ?? null };
  const displayName = resolveDisplayName(nameSource, "User");
  const initials = resolveInitials(nameSource, "U").toLowerCase();

  const { toggle } = useSidebarCollapse();

  const portalName = branding?.portal_name || tenant?.name || "";
  const logoUrl = branding?.logo_url || tenant?.logo_url || "";

  return (
    <aside className="print-sidebar w-64 shrink-0 px-5 py-6 hidden lg:flex">
      {/* Brand + collapse toggle */}
      <div className="mb-8 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={portalName}
              className="h-9 w-auto max-w-[150px] object-contain"
            />
          ) : (
            <div className="truncate text-xl font-semibold tracking-tight text-sidebar-foreground">
              {portalName || "Print Centre"}
            </div>
          )}
        </div>
        <button
          onClick={toggle}
          className="shrink-0 rounded-lg p-1.5 hover:bg-sidebar-accent/40 transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4 text-sidebar-foreground/60 hover:text-sidebar-foreground" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn("sidebar-nav-item", active && "active")}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
              {(item as any).badge && cartCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {cartCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User card */}
      <div className="mt-8 flex items-center justify-between rounded-2xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-warning text-foreground font-semibold text-sm">
            {initials}
          </div>
          <div>
            <div className="text-sm font-medium text-sidebar-foreground">{displayName}</div>
            <button
              onClick={handleSignOut}
              className="text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
        <HelpCircle className="h-5 w-5 text-sidebar-foreground/60" />
      </div>
    </aside>
  );
}
