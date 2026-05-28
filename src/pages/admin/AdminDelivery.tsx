import DeliveryEditor from "@/components/delivery/DeliveryEditor";
import { useTenantContext } from "@/hooks/useTenantContext";

export default function AdminDelivery() {
  const { tenantId } = useTenantContext();
  if (!tenantId) {
    return <div className="p-6 text-sm text-muted-foreground">No active tenant.</div>;
  }
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <DeliveryEditor
        scope="tenant"
        tenantId={tenantId}
        title="Delivery & shipping"
        description="Zones, locations, and weight-tiered rates for your storefront. Branches can override these defaults from their branch detail page."
      />
    </div>
  );
}
