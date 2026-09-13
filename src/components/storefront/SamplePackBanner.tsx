import { Link } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useSamplePack } from "@/hooks/useSamplePack";
import { useStorefrontPrice } from "@/hooks/useStorefrontPrice";
import { Button } from "@/components/ui/button";
import { PackageOpen } from "lucide-react";

/**
 * Trade-only nudge towards the sample pack. Renders nothing unless the offer
 * is switched on and this customer can actually take it.
 */
export default function SamplePackBanner({ compact = false }: { compact?: boolean }) {
  const { tenantPath } = useTenantSlug();
  const { config, eligible } = useSamplePack();
  const { format } = useStorefrontPrice();

  if (!eligible) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-4 rounded-xl border border-border bg-accent/30 ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <PackageOpen className="text-primary shrink-0" size={compact ? 22 : 28} />
      <div className="min-w-[14rem] flex-1">
        <p className="font-semibold text-foreground">{config.headline}</p>
        <p className="text-sm text-muted-foreground">{config.blurb}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold text-foreground">{format(config.price)}</span>
        <Button asChild size={compact ? "sm" : "default"}>
          <Link to={`${tenantPath}/sample-pack`}>Start my sample pack</Link>
        </Button>
      </div>
    </div>
  );
}
