import { Outlet, useLocation } from "react-router-dom";
import { Store } from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";
import { useBranchStorefrontGate } from "@/hooks/useBranchSubscriptions";

/**
 * Hard-stop for restricted / cancelled branches on the customer storefront.
 * When the branch entitlement blocks checkout, all order-building routes
 * are replaced with a friendly "temporarily unavailable" page.
 *
 * Auth, legal, and account pages remain reachable so customers can still
 * sign in and review their history.
 */
const ALLOWED_PATH_SEGMENTS = [
  "auth",
  "legal",
  "privacy",
  "terms",
  "account",
  "settings",
  "welcome",
  "reset-password",
];

export default function StorefrontEntitlementGuard() {
  const { activeBranch } = useBranch();
  const gate = useBranchStorefrontGate(activeBranch?.id);
  const location = useLocation();

  const isAllowlisted = ALLOWED_PATH_SEGMENTS.some((seg) =>
    location.pathname.includes(`/${seg}`),
  );

  if (gate.loading || !gate.checkoutBlocked || isAllowlisted) {
    return <Outlet />;
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl mb-6"
        style={{ background: "hsl(var(--tenant-primary, var(--primary)) / 0.12)" }}
      >
        <Store className="h-8 w-8" style={{ color: "hsl(var(--tenant-primary, var(--primary)))" }} />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        This store is temporarily unavailable
      </h1>
      <p className="text-muted-foreground max-w-md">
        {gate.reason ?? "New orders are paused right now. Please check back soon."}
      </p>
    </div>
  );
}
