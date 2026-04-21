import { Link, useNavigate, useParams } from "react-router-dom";
import { Bell, Search, ShoppingCart, User, LogOut, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useCartItemCount } from "@/hooks/useCart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const portalName = branding?.portal_name || tenant?.name || "Print Centre";
  const logoUrl = branding?.logo_url || tenant?.logo_url || "";
  const initial = (user?.email?.[0] || "U").toUpperCase();

  return (
    <header className="print-topbar">
      {/* Brand (visible especially when sidebar collapses) */}
      <Link to={`/t/${slug}/print-centre`} className="flex items-center gap-2 shrink-0">
        {logoUrl ? (
          <img src={logoUrl} alt={portalName} className="h-7 w-auto max-w-[130px] object-contain" />
        ) : (
          <span className="text-base font-semibold text-foreground truncate">{portalName}</span>
        )}
      </Link>

      <div className="search-shell max-w-2xl">
        <Search className="h-5 w-5 text-muted-foreground" />
        <input
          className="search-input"
          placeholder="Search files, products or orders"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="relative rounded-xl p-2 hover:bg-secondary" aria-label="Notifications">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-success" />
        </button>

        <Link
          to={`/t/${slug}/cart`}
          className="relative rounded-xl p-2 hover:bg-secondary"
          aria-label="Cart"
        >
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          {cartCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {cartCount}
            </span>
          )}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full border border-border bg-card p-1 shadow-sm"
              aria-label="Account menu"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-primary text-primary-foreground text-sm font-semibold">
                {initial}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{user?.email ?? "Account"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(`/t/${slug}/account`)}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              My Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/t/${slug}/orders`)}>
              <User className="mr-2 h-4 w-4" />
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
