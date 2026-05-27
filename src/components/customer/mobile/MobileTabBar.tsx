import { NavLink, useLocation } from "react-router-dom";
import { Home, Plus, ClipboardList, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useAuth } from "@/hooks/useAuth";
import { isAnonymousUser } from "@/lib/tenantSignOut";

/** Routes (relative to /t/:slug) where the bottom tab bar is hidden so the
 *  primary CTA isn't covered (configurator, checkout, full-screen flows). */
const HIDDEN_PATTERNS: RegExp[] = [
  /\/checkout$/,
  /\/orders\/new(\/.*)?$/,
  /\/orders\/[^/]+\/files$/,
  /\/orders\/[^/]+\/build$/,
  /\/orders\/[^/]+\/photo-prints$/,
  /\/orders\/[^/]+\/confirmation$/,
  /\/auth(\/.*)?$/,
];

export function useTabBarHidden() {
  const { pathname } = useLocation();
  return HIDDEN_PATTERNS.some((re) => re.test(pathname));
}

export default function MobileTabBar() {
  const { tenantPath } = useTenantSlug();
  const { user } = useAuth();
  const isAuth = !!user && !isAnonymousUser(user);
  const hidden = useTabBarHidden();

  if (hidden) return null;

  const tabs = [
    { to: tenantPath("print-centre"), icon: Home, label: "Home", end: true },
    { to: tenantPath("orders/new"), icon: Plus, label: "Create", end: false, primary: true },
    {
      to: isAuth ? tenantPath("orders") : tenantPath("auth"),
      icon: ClipboardList,
      label: isAuth ? "Orders" : "Sign in",
      end: false,
    },
    { to: tenantPath("account"), icon: User, label: "Account", end: false },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-white/95 backdrop-blur shadow-[0_-4px_16px_rgba(16,24,40,0.06)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavLink
            key={tab.to + tab.label}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-14",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
            style={({ isActive }) =>
              isActive
                ? { color: "hsl(var(--tenant-primary, var(--primary)))" }
                : undefined
            }
          >
            {({ isActive }) =>
              tab.primary ? (
                <>
                  <span
                    className="-mt-3 flex h-11 w-11 items-center justify-center rounded-full text-primary-foreground shadow-md"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(var(--tenant-primary, var(--primary))), hsl(var(--tenant-accent, var(--tenant-primary, var(--primary)))))",
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="mt-0.5">{tab.label}</span>
                </>
              ) : (
                <>
                  <Icon className="h-5 w-5" />
                  <span>{tab.label}</span>
                </>
              )
            }
          </NavLink>
        );
      })}
    </nav>
  );
}
