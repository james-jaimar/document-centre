import { Link, useLocation, useNavigate } from "react-router-dom";
import { withAuthRedirect } from "@/lib/auth/authReturnPath";
import { Menu, ShoppingCart, LogIn, MapPin } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useCartItemCount } from "@/hooks/useCart";
import { isAnonymousUser } from "@/lib/tenantSignOut";
import { useBranch } from "@/contexts/BranchContext";
import MobileNavSheet from "./MobileNavSheet";
import CountryFlagBadge from "@/components/customer/CountryFlagBadge";


export default function MobileHeader() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantPath } = useTenantSlug();
  const { user } = useAuth();
  const { tenant } = useTenantFromSlug();
  const { data: branding } = useTenantBranding(tenant?.id ?? null);
  const cartCount = useCartItemCount();
  const isAuthenticated = !!user && !isAnonymousUser(user);
  const { activeBranch, isMultiBranch, openPicker } = useBranch();

  const portalName = branding?.portal_name || tenant?.name || "Print Centre";
  let logoUrl = branding?.logo_url || tenant?.logo_url || "";
  if (!logoUrl && branding?.facsimile_enabled && branding?.header_html) {
    const m = branding.header_html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m?.[1]) logoUrl = m[1];
  }
  const initial = (user?.email?.[0] || "U").toUpperCase();

  return (
    <>
      <header
        className="sticky top-0 z-30 flex h-14 w-full items-center gap-2 border-b border-border bg-white/95 px-2 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground/80 hover:bg-secondary"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link
          to={tenantPath("print-centre")}
          className="flex flex-1 min-w-0 items-center justify-center"
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={portalName}
              className="h-9 max-w-[180px] w-auto object-contain"
            />
          ) : (
            <span className="truncate text-sm font-semibold text-foreground">{portalName}</span>
          )}
        </Link>

        {isMultiBranch ? (
          <button
            onClick={openPicker}
            aria-label={activeBranch ? `Branch: ${activeBranch.name}` : "Select branch"}
            title={activeBranch ? "Change branch" : "Select branch"}
            className="flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 shrink-0"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "hsl(var(--tenant-primary, var(--primary)))" }} />
            <span className="truncate max-w-[80px]">{activeBranch?.name ?? "Branch"}</span>
          </button>
        ) : activeBranch ? (
          <div
            aria-disabled="true"
            title={activeBranch.name}
            className="flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1.5 text-[11px] font-medium text-muted-foreground shrink-0"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "hsl(var(--tenant-primary, var(--primary)))" }} />
            <span className="truncate max-w-[80px]">{activeBranch.name}</span>
          </div>
        ) : null}

        <CountryFlagBadge countryCode={(tenant as any)?.country_code} compact />



        <Link
          to={tenantPath("cart")}
          aria-label="Cart"
          className="relative flex h-11 w-11 items-center justify-center rounded-lg text-foreground/80 hover:bg-secondary"
        >
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-primary-foreground"
              style={{ background: "hsl(var(--tenant-primary, var(--primary)))" }}
            >
              {cartCount}
            </span>
          )}
        </Link>

        {isAuthenticated ? (
          <button
            onClick={() => navigate(tenantPath("account"))}
            aria-label="Account"
            className="flex h-11 w-11 items-center justify-center"
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
        ) : (
          <Link
            to={withAuthRedirect(tenantPath("auth"), location)}
            aria-label="Sign in"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground/80 hover:bg-secondary"
          >
            <LogIn className="h-5 w-5" />
          </Link>
        )}
      </header>

      <MobileNavSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
