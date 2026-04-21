import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";

export default function PortalPrivacy() {
  const { tenant } = useTenantFromSlug();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Privacy Policy</h1>
      <p className="text-muted-foreground">
        The privacy policy for {tenant?.name ?? "this storefront"} is coming soon. In the meantime,
        please contact the storefront administrator with any questions.
      </p>
    </div>
  );
}
