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
  { to: "/branch/products", icon: <Store size={20} />, label: "Products" },
  { to: "/branch/pricing", icon: <DollarSign size={20} />, label: "Pricing" },
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

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="flex items-center justify-between border-b border-sidebar-border p-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Printer size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight">
                {tenantName ? `${tenantName} — ${branchLabel}` : branchLabel}
              </h1>
              <p className="text-xs text-sidebar-muted">Branch Portal</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1 hover:bg-sidebar-accent"
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
          {BRANCH_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
              {user.email?.[0].toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.email}</p>
              <p className="truncate text-xs text-sidebar-muted">{roleLabel}</p>
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
