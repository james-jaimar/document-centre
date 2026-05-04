import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Home,
  Plus,
  ClipboardList,
  Settings,
  PanelLeftClose,
  ShoppingCart,
  LogOut,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse";
import { useCartItemCount } from "@/hooks/useCart";
import { resolveDisplayName, resolveInitials } from "@/lib/displayName";

const buildPublicNavItems = (slug: string) => [
  { to: `/t/${slug}/print-centre`, icon: Home, label: "Home", exact: true },
  { to: `/t/${slug}/orders/new`, icon: Plus, label: "Create", exact: false },
];

const buildAuthNavItems = (slug: string) => [
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
  const navItems = user ? buildAuthNavItems(slug ?? "") : buildPublicNavItems(slug ?? "");

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
  const initials = resolveInitials(nameSource, "U").toUpperCase();

  const { toggle } = useSidebarCollapse();

  return (
    <aside className="print-sidebar w-64 shrink-0 px-4 py-5 hidden lg:flex">
      {/* Collapse toggle */}
      <div className="mb-6 flex items-center justify-end px-1">
        <button
          onClick={toggle}
          className="shrink-0 rounded-lg p-1.5 hover:bg-sidebar-accent/40 transition-colors"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4 text-sidebar-foreground/60 hover:text-sidebar-foreground" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn("sidebar-nav-item", active && "active")}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span>{item.label}</span>
              {(item as any).badge && cartCount > 0 && (
                <span
                  className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-primary-foreground"
                  style={{ background: "hsl(var(--tenant-accent, var(--tenant-primary, var(--primary))))" }}
                >
                  {cartCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User card — only for authenticated users */}
      {user ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/30 px-3 py-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-sidebar-foreground"
            style={{ background: "hsl(var(--tenant-accent, var(--tenant-primary, var(--sidebar-accent))) / 0.35)" }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</div>
            <button
              onClick={handleSignOut}
              className="text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            >
              Sign Out
            </button>
          </div>
          <button
            onClick={handleSignOut}
            className="shrink-0 rounded-lg p-1.5 hover:bg-sidebar-accent/50 transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4 text-sidebar-foreground/60" />
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <Link
            to={`/t/${slug}/auth`}
            className="sidebar-nav-item flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <LogIn className="h-[18px] w-[18px]" />
            <span>Sign In</span>
          </Link>
        </div>
      )}
    </aside>
  );
}
