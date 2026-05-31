import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useLegalDocument } from "@/hooks/useLegalDocument";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultTermsHtml } from "@/lib/legal/defaultTemplates";

export default function PortalTerms() {
  const { tenant } = useTenantFromSlug();
  const { html, updatedAt, isLoading } = useLegalDocument(tenant?.id ?? null, "terms");

  const content =
    html ||
    (tenant
      ? defaultTermsHtml({ tenant_name: tenant.name, country: "South Africa" })
      : "");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tenant?.name ?? "This storefront"}
          {updatedAt && <> · Last updated {new Date(updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</>}
        </p>
      </div>
      {isLoading && !content ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <article
          className="prose prose-sm md:prose-base max-w-none text-foreground"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
    </div>
  );
}
