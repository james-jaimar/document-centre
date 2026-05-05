import { Link, NavLink, useNavigate } from "react-router-dom";
import { ShoppingCart, User, LogOut, Settings as SettingsIcon, ClipboardList, ExternalLink, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useCartItemCount } from "@/hooks/useCart";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function CustomerHeader() {
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { tenant } = useTenantFromSlug();
  const { data: branding } = useTenantBranding(tenant?.id ?? null);
  const handleSignOut = async () => {
    await signOut();
    const origin = branding?.origin_url;
    if (origin) {
      window.location.href = origin;
    } else {
      navigate("/", { replace: true });
    }
  };
  const cartCount = useCartItemCount();

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
  ];
  const authNavItems = [
    { to: tenantPath("print-centre"), label: "Home", end: true },
    { to: tenantPath("orders/new"), label: "Create", end: false },
    { to: tenantPath("orders"), label: "Orders", end: false },
    { to: tenantPath("cart"), label: "Cart", end: false },
    { to: tenantPath("account"), label: "My Account", end: false },
  ];
  const navItems = user ? authNavItems : publicNavItems;

  // Right controls renderer
  const renderRightControls = () => {
    if (!user) {
      return (
        <Link
          to={tenantPath("auth")}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
        >
          <LogIn className="h-4 w-4" />
          Sign In
        </Link>
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

  return (
    <header className="print-topbar">
      {/* Optional "Back to site" link */}
      {originUrl && (
        <a
          href={originUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mr-3 shrink-0"
        >
          <ExternalLink className="h-3 w-3" />
          Back to site
        </a>
      )}

      <Link to={tenantPath("print-centre")} className="flex items-center shrink-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={portalName}
            className="h-16 w-auto max-w-[260px] object-contain"
          />
        ) : (
          <span className="text-lg font-semibold text-foreground truncate">{portalName}</span>
        )}
      </Link>

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
