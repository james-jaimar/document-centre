import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Package,
  Settings,
  Users,
  DollarSign,
  Gauge,
  ChevronLeft,
  ShoppingCart,
  Globe,
  Printer,
  LogOut,
  Cog,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

interface NavSection {
  heading: string;
  items: NavItem[];
  roles: AppRole[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Customer",
    roles: ["customer", "store_operator", "branch_manager", "head_office_admin", "platform_admin"],
    items: [
      { to: "/dashboard", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
      { to: "/dashboard/orders", icon: <ShoppingCart size={20} />, label: "My Orders" },
      { to: "/dashboard/settings", icon: <Settings size={20} />, label: "Account" },
    ],
  },
  {
    heading: "Branch",
    roles: ["branch_manager", "store_operator", "head_office_admin", "platform_admin"],
    items: [
      { to: "/branch", icon: <Gauge size={20} />, label: "Branch Queue" },
      { to: "/branch/settings", icon: <Cog size={20} />, label: "Branch Settings" },
    ],
  },
  {
    heading: "Administration",
    roles: ["head_office_admin", "platform_admin"],
    items: [
      { to: "/admin", icon: <LayoutDashboard size={20} />, label: "Admin Home" },
      { to: "/admin/orders", icon: <ClipboardList size={20} />, label: "Order Manager" },
      { to: "/admin/branches", icon: <Building2 size={20} />, label: "Branches" },
      { to: "/admin/products", icon: <Package size={20} />, label: "Products" },
      { to: "/admin/pricing", icon: <DollarSign size={20} />, label: "Pricing" },
      { to: "/admin/users", icon: <Users size={20} />, label: "Users & Roles" },
      { to: "/admin/settings", icon: <Settings size={20} />, label: "Tenant Settings" },
    ],
  },
  {
    heading: "Platform",
    roles: ["platform_admin"],
    items: [
      { to: "/platform", icon: <Globe size={20} />, label: "Tenants" },
      { to: "/platform/settings", icon: <Settings size={20} />, label: "Platform Settings" },
    ],
  },
];

export default function AppSidebar() {
  const location = useLocation();
  const { roles, signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const visibleSections = NAV_SECTIONS.filter((section) =>
    section.roles.some((r) => roles.includes(r))
  );

  const isActive = (path: string) => {
    if (path === "/dashboard" || path === "/branch" || path === "/admin" || path === "/platform") {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand header */}
      <div className="flex items-center justify-between border-b border-sidebar-border p-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Printer size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">PrintHub</h1>
              <p className="text-xs text-sidebar-muted">Web to Print</p>
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
        {visibleSections.map((section, idx) => (
          <div key={section.heading} className={cn(idx > 0 && "mt-6")}>
            {!collapsed && (
              <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                {section.heading}
              </div>
            )}
            {collapsed && idx > 0 && <div className="my-3 mx-2 border-t border-sidebar-border" />}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
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
          </div>
        ))}
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
              <p className="truncate text-xs text-sidebar-muted">{roles[0] ?? "user"}</p>
            </div>
          </div>
        )}
        <button
          onClick={signOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
          title={collapsed ? "Sign Out" : undefined}
        >
          <LogOut size={18} />
          {!collapsed && "Sign Out"}
        </button>
      </div>
    </aside>
  );
}
