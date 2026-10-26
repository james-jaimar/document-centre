import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useStorefrontPages } from "@/hooks/useStorefrontPages";

/** Blocks checkout while a tenant storefront is in soft launch. */
export default function SoftLaunchGuard({ children }: { children: ReactNode }) {
  const { tenantId } = useTenantContext();
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const { softLaunch, config, isLoading } = useStorefrontPages(tenantId);

  if (isLoading) return null;
  if (!softLaunch) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h1 className="mb-2 text-2xl font-semibold text-foreground">Online ordering opens soon</h1>
      <p className="max-w-md text-muted-foreground">{config.soft_launch.message}</p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={() => navigate(tenantPath("shop"))}>Back to shop</Button>
        <Button onClick={() => navigate("/contact")}>Contact us</Button>
      </div>
    </div>
  );
}
