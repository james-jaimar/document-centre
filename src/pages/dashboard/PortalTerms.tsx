import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";

export default function PortalTerms() {
  const { tenant } = useTenantFromSlug();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terms of Service</h1>
      <p className="text-muted-foreground">
        Terms for {tenant?.name ?? "this storefront"} are coming soon. In the meantime, please contact
        the storefront administrator with any questions.
      </p>
    </div>
  );
}
