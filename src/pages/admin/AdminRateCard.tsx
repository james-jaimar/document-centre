import RateCardEditor from "@/components/pricing/RateCardEditor";
import { useTenantContext } from "@/hooks/useTenantContext";

export default function AdminRateCard() {
  const { tenantId } = useTenantContext();

  if (!tenantId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No active tenant.
      </div>
    );
  }

  return (
    <div className="p-6">
      <RateCardEditor
        scope="tenant"
        tenantId={tenantId}
        title="Pricing"
        description="Your tenant rate card. Edits here only affect your storefront. Use 'Pull missing from master' to bring in any new items the platform has added."
      />
    </div>
  );
}
