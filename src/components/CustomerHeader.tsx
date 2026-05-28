import { Link, NavLink, useNavigate } from "react-router-dom";
import { ShoppingCart, User, LogOut, Settings as SettingsIcon, ClipboardList, LogIn, MapPin, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useCartItemCount } from "@/hooks/useCart";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { setTenantSignOutFlag, isAnonymousUser } from "@/lib/tenantSignOut";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useBranch, clearSavedBranch } from "@/contexts/BranchContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function CustomerHeader() {
  const { slug, tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { tenant } = useTenantFromSlug();
  const { data: branding } = useTenantBranding(tenant?.id ?? null);
  const queryClient = useQueryClient();
  const isAnon = isAnonymousUser(user);
  const { activeBranch, isMultiBranch, openPicker, loading: branchesLoading } = useBranch();

  const handleSignOut = async () => {
    if (slug) setTenantSignOutFlag(slug);
    if (tenant?.id) clearSavedBranch(tenant.id);
    await signOut();
    queryClient.clear();
    const origin = branding?.origin_url;
    if (origin) {
      window.location.href = origin;
    } else {
      // Stay on the current host (custom domain or platform subdomain) — never kick users to document-centre.com
      window.location.href = window.location.origin;
    }
  };
  const cartCount = useCartItemCount();
  // Treat anonymous users as guests — only show full nav for real users
  const isAuthenticated = !!user && !isAnon;

  const portalName = branding?.portal_name || tenant?.name || "Print Centre";

  // Logo resolution: explicit branding > tenant table > extract from scraped header HTML
  let logoUrl = branding?.logo_url || tenant?.logo_url || "";
  if (!logoUrl && branding?.facsimile_enabled && branding?.header_html) {
    const match = branding.header_html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match?.[1]) logoUrl = match[1];
  }
  const initial = (user?.email?.[0] || "U").toUpperCase();
  const originUrl = branding?.origin_url;

  // Build nav items based on auth state
  const publicNavItems = [
    { to: tenantPath("print-centre"), label: "Home", end: true },
    { to: tenantPath("orders/new"), label: "Create", end: false },
    { to: tenantPath("cart"), label: "Cart", end: false },
  ];
  const authNavItems = [
    { to: tenantPath("print-centre"), label: "Home", end: true },
    { to: tenantPath("orders/new"), label: "Create", end: false },
    { to: tenantPath("orders"), label: "Orders", end: false },
    { to: tenantPath("quotes"), label: "Quotes", end: false },
    { to: tenantPath("cart"), label: "Cart", end: false },
    { to: tenantPath("account"), label: "My Account", end: false },
  ];
  const navItems = isAuthenticated ? authNavItems : publicNavItems;

  // Right controls renderer
  const renderRightControls = () => {
    if (!isAuthenticated) {
      return (
        <>
          <Link
            to={tenantPath("cart")}
            className="relative rounded-xl p-2 hover:bg-secondary transition-colors"
            aria-label="Cart"
          >
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            {cartCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-primary-foreground"
                style={{ background: "hsl(var(--tenant-primary, var(--primary)))" }}
              >
                {cartCount}
              </span>
            )}
          </Link>
          <Link
            to={tenantPath("auth")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </Link>
        </>
      );
    }

    return (
      <>
        <Link
          to={tenantPath("cart")}
          className="relative rounded-xl p-2 hover:bg-secondary transition-colors"
          aria-label="Cart"
        >
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          {cartCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-primary-foreground"
              style={{ background: "hsl(var(--tenant-primary, var(--primary)))" }}
            >
              {cartCount}
            </span>
          )}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full border border-border bg-card shadow-sm hover:shadow-md transition-shadow p-1"
              aria-label="Account menu"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(var(--tenant-primary, var(--primary))), hsl(var(--tenant-accent, var(--tenant-primary, var(--primary)))))",
                }}
              >
                {initial}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{user?.email ?? "Account"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(tenantPath("account"))}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              My Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(tenantPath("orders"))}>
              <ClipboardList className="mr-2 h-4 w-4" />
              My Orders
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  };

  const logoContent = logoUrl ? (
    <img
      src={logoUrl}
      alt={portalName}
      className="h-16 w-auto max-w-[260px] object-contain"
    />
  ) : (
    <span className="text-lg font-semibold text-foreground truncate">{portalName}</span>
  );

  return (
    <header className="print-topbar">
      <Link to={tenantPath("print-centre")} className="flex items-center shrink-0">
        {logoContent}
      </Link>

      {/* Branch indicator — always visible while loading or for multi-branch tenants */}
      {branchesLoading ? (
        <div
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground border border-border/50 ml-2 shrink-0"
          title="Loading branches"
        >
          <span className="h-3 w-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/70 animate-spin" />
          <span>Loading branches…</span>
        </div>
      ) : isMultiBranch ? (
        <button
          onClick={openPicker}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ml-2 shrink-0 border",
            activeBranch
              ? "text-muted-foreground hover:text-foreground hover:bg-secondary/80 border-border/50"
              : "text-foreground hover:bg-secondary/80 border-primary/40",
          )}
          title={activeBranch ? "Change branch" : "Select your branch"}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "hsl(var(--tenant-primary, var(--primary)))" }} />
          <span className="truncate max-w-[140px]">{activeBranch?.name ?? "Select branch"}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      ) : null}


      <nav className="hidden md:flex items-center gap-7 mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn("header-nav-link", isActive && "active")}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto md:ml-0 flex items-center gap-2">
        {renderRightControls()}
      </div>
    </header>
  );
}
