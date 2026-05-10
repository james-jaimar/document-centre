import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Package,
  Settings,
  Users,
  DollarSign,
  ChevronLeft,
  Globe,
  Printer,
  LogOut,
  ClipboardList,
  Factory,
  Store,
  Wrench,
  UserSquare2,
  Mail,
  Sparkles,
  FileText,
  Activity,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import type { Database } from "@/integrations/supabase/types";
import { buildAdminPath } from "@/lib/adminRouting";

type AppRole = Database["public"]["Enums"]["app_role"];
type MembershipRole =
  | "owner"
  | "admin"
  | "sales"
  | "production"
  | "accounts"
  | "branch_manager"
  | "store_operator"
  | "customer";

const ROLE_LABELS: Record<AppRole, string> = {
  platform_admin: "Platform Admin",
  head_office_admin: "Tenant Admin",
  branch_manager: "Branch Manager",
  store_operator: "Store Operator",
  customer: "Customer",
};

const MEMBERSHIP_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  sales: "Sales",
  production: "Production",
  accounts: "Accounts",
  branch_manager: "Branch Manager",
  store_operator: "Store Operator",
  customer: "Customer",
};

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

interface NavSection {
  heading: string;
  items: NavItem[];
  appRoles?: AppRole[];
  membershipRoles?: MembershipRole[];
}

const PLATFORM_SECTIONS: NavSection[] = [
  {
    heading: "Platform",
    appRoles: ["platform_admin"],
    items: [
      { to: "/platform", icon: <Globe size={20} />, label: "Tenants" },
      { to: "/platform/users", icon: <Users size={20} />, label: "All Users" },
      { to: "/platform/demo", icon: <Sparkles size={20} />, label: "Demo Activity" },
      { to: "/platform/subscriptions", icon: <CreditCard size={20} />, label: "Subscriptions" },
      { to: "/platform/document-centre", icon: <Activity size={20} />, label: "Document Centre" },
      { to: "/platform/settings", icon: <Settings size={20} />, label: "Platform Settings" },
    ],
  },
  {
    heading: "Master Catalogue",
    appRoles: ["platform_admin"],
    items: [
      { to: "/platform/products", icon: <Package size={20} />, label: "Products" },
      { to: "/platform/master-pricing", icon: <DollarSign size={20} />, label: "Master Pricing" },
      { to: "/platform/pricing", icon: <DollarSign size={20} />, label: "Pricing Regions" },
      { to: "/platform/demo-print-pricing", icon: <DollarSign size={20} />, label: "Demo Print Pricing" },
    ],
  },
];

const ADMIN_SECTIONS: NavSection[] = [
  {
    heading: "Operations",
    appRoles: ["head_office_admin", "platform_admin", "branch_manager", "store_operator"],
    membershipRoles: ["owner", "admin", "sales", "production", "accounts", "branch_manager", "store_operator"],
    items: [
      { to: "/admin", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
      { to: "/admin/orders", icon: <ClipboardList size={20} />, label: "Order Manager" },
      { to: "/admin/production", icon: <Factory size={20} />, label: "Production Queue" },
    ],
  },
  {
    heading: "My Branch",
    appRoles: ["branch_manager", "store_operator"],
    membershipRoles: ["branch_manager", "store_operator"],
    items: [
      { to: "/branch/products", icon: <Store size={20} />, label: "My Products" },
      { to: "/branch/settings", icon: <Wrench size={20} />, label: "Branch Settings" },
    ],
  },
  {
    heading: "Configuration",
    appRoles: ["head_office_admin", "platform_admin"],
    membershipRoles: ["owner", "admin"],
    items: [
      { to: "/admin/branches", icon: <Building2 size={20} />, label: "Branches" },
      { to: "/admin/products", icon: <Package size={20} />, label: "Products" },
      { to: "/admin/pricing", icon: <DollarSign size={20} />, label: "Pricing" },
      { to: "/admin/customers", icon: <UserSquare2 size={20} />, label: "Customers" },
      { to: "/admin/users", icon: <Users size={20} />, label: "Users & Roles" },
    ],
  },
  {
    heading: "Communications",
    appRoles: ["head_office_admin", "platform_admin"],
    membershipRoles: ["owner", "admin"],
    items: [
      { to: "/admin/sent-mail", icon: <Mail size={20} />, label: "Sent Mail" },
      { to: "/admin/documents", icon: <FileText size={20} />, label: "Documents" },
    ],
  },
  {
    heading: "Settings",
    appRoles: ["head_office_admin", "platform_admin"],
    membershipRoles: ["owner", "admin"],
    items: [
      { to: "/admin/settings", icon: <Settings size={20} />, label: "Tenant Settings" },
    ],
  },
];

export default function AppSidebar() {
  const location = useLocation();
  const { roles, signOut, user, highestRole } = useAuth();
  const { tenantId, tenantName, membershipRole, isOverriding, setOverrideTenantId } = useTenantContext();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const isPlatformArea = location.pathname.startsWith("/platform");

  const sections = isPlatformArea ? PLATFORM_SECTIONS : ADMIN_SECTIONS;

  const sectionVisible = (section: NavSection) => {
    const appMatch = section.appRoles?.some((r) => roles.includes(r)) ?? false;
    const memberMatch =
      !!membershipRole &&
      (section.membershipRoles?.includes(membershipRole as MembershipRole) ?? false);
    return appMatch || memberMatch;
  };

  let visibleSections = sections.filter(sectionVisible);

  // Defensive fallback: in admin area with a recognised membership role but
  // no visible sections (e.g. role drift), surface at least the dashboard.
  if (
    !isPlatformArea &&
    visibleSections.length === 0 &&
    membershipRole &&
    ["owner", "admin", "sales", "production", "accounts"].includes(membershipRole)
  ) {
    visibleSections = [ADMIN_SECTIONS[0]];
  }

  const isActive = (path: string) => {
    if (path === "/admin" || path === "/platform") {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  // Footer label: prefer membership role inside admin/branch shells so tenant
  // admins don't appear as "Customer" (which comes from legacy user_roles).
  const footerRoleLabel = isPlatformArea
    ? (highestRole ? ROLE_LABELS[highestRole] : "User")
    : (membershipRole
        ? MEMBERSHIP_ROLE_LABELS[membershipRole] ?? membershipRole
        : (highestRole ? ROLE_LABELS[highestRole] : "User"));

  const headerSubtitle = isPlatformArea
    ? "Platform Admin"
    : (membershipRole
        ? MEMBERSHIP_ROLE_LABELS[membershipRole] ?? membershipRole
        : "Tenant Admin");

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
              <h1 className="text-base font-bold leading-tight">
                {isPlatformArea ? "Document Centre" : tenantName || "Document Centre"}
              </h1>
              <p className="text-xs text-sidebar-muted">{headerSubtitle}</p>
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

      {/* Cross-portal link */}
      {!collapsed && !isPlatformArea && roles.includes("platform_admin") && (
        <Link
          to="/platform"
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-xs font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setOverrideTenantId(null)}
        >
          <Globe size={14} />
          Back to Platform
        </Link>
      )}

      {/* Tenant override banner */}
      {!collapsed && isOverriding && (
        <div className="mx-3 mt-2 flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
          <span>Viewing: {tenantName}</span>
          <button
            onClick={() => {
              setOverrideTenantId(null);
              navigate("/platform");
            }}
            className="underline underline-offset-2 hover:text-primary/80"
          >
            Exit
          </button>
        </div>
      )}

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
              {section.items.map((item) => {
                const href = item.to.startsWith("/admin")
                  ? buildAdminPath(item.to, tenantId)
                  : item.to;

                return (
                <Link
                  key={item.to}
                  to={href}
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
                );
              })}
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
              <p className="truncate text-xs text-sidebar-muted">{footerRoleLabel}</p>
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
