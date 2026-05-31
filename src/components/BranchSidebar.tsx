import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  Store,
  Wrench,
  ChevronLeft,
  Printer,
  LogOut,
  DollarSign,
  Tags,
  FileText,
  Truck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranches } from "@/hooks/useBranches";
import { useTenantBranding } from "@/hooks/useTenantBranding";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Tenant Admin",
  sales: "Sales",
  production: "Production",
  accounts: "Accounts",
  branch_manager: "Branch Manager",
  store_operator: "Store Operator",
};

const BRANCH_NAV = [
  { to: "/branch", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
  { to: "/branch/orders", icon: <ClipboardList size={20} />, label: "Orders" },
  { to: "/branch/quotes", icon: <FileText size={20} />, label: "Quotes" },
  { to: "/branch/customers", icon: <Users size={20} />, label: "Customers" },
  { to: "/branch/products", icon: <Store size={20} />, label: "Products" },
  { to: "/branch/pricing", icon: <DollarSign size={20} />, label: "Pricing Rules" },
  { to: "/branch/rate-card", icon: <Tags size={20} />, label: "Rate Card" },
  { to: "/branch/delivery", icon: <Truck size={20} />, label: "Delivery" },
  { to: "/branch/settings", icon: <Wrench size={20} />, label: "Settings" },
];

export default function BranchSidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { tenantName, tenantId, branchId, membershipRole } = useTenantContext();
  const { data: branding } = useTenantBranding(tenantId);
  const { data: branches } = useBranches(tenantId);
  const branch = branches?.find((b) => b.id === branchId);
  const branchLabel = branch?.name ?? "Branch";
  const roleLabel = membershipRole ? ROLE_LABELS[membershipRole] ?? membershipRole : "Branch Staff";
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path: string) => {
    if (path === "/branch") return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const brandColor = branding?.primary_color || undefined;
  const brandStyle = brandColor
    ? ({ ["--brand" as any]: brandColor } as React.CSSProperties)
    : undefined;

  return (
    <aside
      style={brandStyle}
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="flex items-start justify-between gap-2 border-b border-sidebar-border p-4">
        {!collapsed && (
          <div className="flex min-w-0 items-start gap-2.5">
            {branding?.logo_url ? (
              <img
                src={branding.logo_url}
                alt={tenantName ?? "Tenant"}
                className="h-9 w-9 shrink-0 rounded-md bg-white/95 object-contain p-0.5"
              />
            ) : (
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white"
                style={{ backgroundColor: brandColor }}
              >
                <Printer size={18} />
              </div>
            )}
            <div className="min-w-0 leading-tight">
              {tenantName && (
                <p className="truncate text-[11px] font-medium uppercase tracking-wide text-sidebar-muted" title={tenantName}>
                  {tenantName}
                </p>
              )}
              <h1
                className="truncate text-[15px] font-semibold"
                style={brandColor ? { color: "var(--brand)" } : undefined}
                title={branchLabel}
              >
                {branchLabel}
              </h1>
              <p className="text-[10px] text-sidebar-muted">Branch Portal</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 rounded-md p-1 hover:bg-sidebar-accent"
        >
          <ChevronLeft
            size={18}
            className={cn("transition-transform", collapsed && "rotate-180")}
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <div className="flex flex-col gap-0.5">
          {BRANCH_NAV.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                style={
                  active && brandColor
                    ? {
                        backgroundColor: `color-mix(in srgb, ${brandColor} 18%, transparent)`,
                        color: brandColor,
                        boxShadow: `inset 2px 0 0 ${brandColor}`,
                      }
                    : active
                    ? undefined
                    : undefined
                }
                title={collapsed ? item.label : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <div className="mb-2 flex items-center gap-2 px-1" title={user.email ?? undefined}>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: brandColor || "hsl(var(--sidebar-primary))" }}
            >
              {user.email?.[0].toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium leading-tight">{user.email}</p>
              <p className="truncate text-[10px] text-sidebar-muted">{roleLabel}</p>
            </div>
          </div>
        )}
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          title={collapsed ? "Sign Out" : undefined}
        >
          <LogOut size={18} />
          {!collapsed && "Sign Out"}
        </button>
      </div>
    </aside>
  );
}
