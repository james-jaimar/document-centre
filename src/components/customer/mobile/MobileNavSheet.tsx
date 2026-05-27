import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Plus,
  ClipboardList,
  FileText,
  ShoppingCart,
  Settings,
  LogOut,
  LogIn,
  MapPin,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useCartItemCount } from "@/hooks/useCart";
import { setTenantSignOutFlag, isAnonymousUser } from "@/lib/tenantSignOut";
import { useBranch, clearSavedBranch } from "@/contexts/BranchContext";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MobileNavSheet({ open, onOpenChange }: Props) {
  const { slug, tenantPath } = useTenantSlug();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { tenant } = useTenantFromSlug();
  const { data: branding } = useTenantBranding(tenant?.id ?? null);
  const queryClient = useQueryClient();
  const isAnon = isAnonymousUser(user);
  const isAuthenticated = !!user && !isAnon;
  const cartCount = useCartItemCount();
  const { activeBranch, isMultiBranch, openPicker } = useBranch();

  const portalName = branding?.portal_name || tenant?.name || "Print Centre";

  const publicNav = [
    { to: tenantPath("print-centre"), icon: Home, label: "Home", exact: true },
    { to: tenantPath("orders/new"), icon: Plus, label: "Create an Order", exact: false },
  ];
  const authNav = [
    { to: tenantPath("print-centre"), icon: Home, label: "Home", exact: true },
    { to: tenantPath("orders/new"), icon: Plus, label: "Create an Order", exact: false },
    { to: tenantPath("orders"), icon: ClipboardList, label: "My Orders", exact: false },
    { to: tenantPath("quotes"), icon: FileText, label: "My Quotes", exact: false },
    { to: tenantPath("cart"), icon: ShoppingCart, label: "Cart", exact: false, badge: true as const },
    { to: tenantPath("account"), icon: Settings, label: "My Account", exact: false },
  ];
  const items = isAuthenticated ? authNav : publicNav;

  const isActive = (path: string, exact: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const handleSignOut = async () => {
    if (slug) setTenantSignOutFlag(slug);
    if (tenant?.id) clearSavedBranch(tenant.id);
    onOpenChange(false);
    await signOut();
    queryClient.clear();
    const origin = branding?.origin_url;
    window.location.href = origin || window.location.origin;
  };

  const handleNav = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[85vw] max-w-[340px] p-0 print-sidebar border-r-0">
        <SheetHeader className="px-5 pt-5 pb-3 text-left">
          <SheetTitle className="text-sidebar-foreground text-base font-semibold truncate">
            {portalName}
          </SheetTitle>
        </SheetHeader>

        {/* Branch chip */}
        {isMultiBranch && (
          <button
            onClick={() => {
              onOpenChange(false);
              openPicker();
            }}
            className="mx-5 mb-3 flex items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/20 px-3 py-2 text-xs text-sidebar-foreground/90"
          >
            <MapPin
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: "hsl(var(--tenant-accent, var(--tenant-primary, var(--sidebar-accent))))" }}
            />
            <span className="truncate">{activeBranch?.name ?? "Select branch"}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider opacity-60">Change</span>
          </button>
        )}

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => onOpenChange(false)}
                className={cn("sidebar-nav-item min-h-11", active && "active")}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{item.label}</span>
                {"badge" in item && item.badge && cartCount > 0 && (
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

        {/* Footer auth */}
        <div className="mt-auto border-t border-sidebar-border/40 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {isAuthenticated ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-sidebar-foreground">
                  {user?.email}
                </div>
                <div className="text-xs text-sidebar-foreground/60">Signed in</div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleNav(tenantPath("auth"))}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sidebar-accent/40 px-4 py-3 text-sm font-semibold text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
