import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { ShoppingCart, User, LogOut, Settings as SettingsIcon, ClipboardList, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useCartItemCount } from "@/hooks/useCart";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useRef } from "react";

export default function CustomerHeader() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };
  const { tenant } = useTenantFromSlug();
  const { data: branding } = useTenantBranding(tenant?.id ?? null);
  const cartCount = useCartItemCount();
  const facsimileRef = useRef<HTMLDivElement>(null);

  const portalName = branding?.portal_name || tenant?.name || "Print Centre";
  const logoUrl = branding?.logo_url || tenant?.logo_url || "";
  const initial = (user?.email?.[0] || "U").toUpperCase();

  const base = `/t/${slug}`;
  const navItems = [
    { to: `${base}/print-centre`, label: "Home", end: true },
    { to: `${base}/orders/new`, label: "Create", end: false },
    { to: `${base}/orders`, label: "Orders", end: false },
    { to: `${base}/cart`, label: "Cart", end: false },
    { to: `${base}/account`, label: "My Account", end: false },
  ];

  const isFacsimile = branding?.facsimile_enabled && branding?.header_html;

  // Neutralise all links inside the facsimile header
  useEffect(() => {
    if (!isFacsimile || !facsimileRef.current) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const el = facsimileRef.current;
    el.addEventListener("click", handler, true);
    return () => el.removeEventListener("click", handler, true);
  }, [isFacsimile, branding?.header_html]);

  if (isFacsimile) {
    return (
      <div className="w-full">
        {/* Facsimile header from tenant's website */}
        {branding.header_css && (
          <style dangerouslySetInnerHTML={{ __html: `.facsimile-header { all: initial; } .facsimile-header * { box-sizing: border-box; } ${branding.header_css}` }} />
        )}
        <div
          ref={facsimileRef}
          className="facsimile-header relative"
          dangerouslySetInnerHTML={{ __html: branding.header_html }}
        />

        {/* Slim internal navigation bar */}
        <div className="print-topbar !py-1 !px-4 !min-h-0 border-b border-border/50 bg-muted/30">
          {/* Back to site link */}
          {branding.origin_url && (
            <a
              href={branding.origin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mr-4 shrink-0"
            >
              <ExternalLink className="h-3 w-3" />
              Back to site
            </a>
          )}

          {/* Centre nav */}
          <nav className="flex items-center gap-5 mx-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn(
                  "text-xs font-medium py-1 transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-2">
            <Link
              to={`${base}/cart`}
              className="relative rounded-lg p-1.5 hover:bg-secondary transition-colors"
              aria-label="Cart"
            >
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
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
                  className="rounded-full border border-border bg-card p-0.5 shadow-sm hover:shadow-md transition-shadow"
                  aria-label="Account menu"
                >
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-primary-foreground"
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
                <DropdownMenuItem onClick={() => navigate(`${base}/account`)}>
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  My Account
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`${base}/orders`)}>
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
          </div>
        </div>
      </div>
    );
  }

  // Standard header (non-facsimile)
  return (
    <header className="print-topbar">
      {/* Brand */}
      <Link to={`${base}/print-centre`} className="flex items-center shrink-0">
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

      {/* Centre nav */}
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

      {/* Right controls */}
      <div className="ml-auto md:ml-0 flex items-center gap-2">
        <Link
          to={`${base}/cart`}
          className="relative rounded-xl p-2 hover:bg-secondary transition-colors"
          aria-label="Cart"
        >
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          {cartCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-primary-foreground"
              style={{ background: "hsl(var(--tenant-primary, var(--primary)))" }}
            >
              {cartCount}
            </span>
          )}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full border border-border bg-card p-1 shadow-sm hover:shadow-md transition-shadow"
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
            <DropdownMenuItem onClick={() => navigate(`${base}/account`)}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              My Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`${base}/orders`)}>
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
      </div>
    </header>
  );
}
