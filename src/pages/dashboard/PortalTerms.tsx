import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useLegalDocument } from "@/hooks/useLegalDocument";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultTermsHtml, interpolateLegal } from "@/lib/legal/defaultTemplates";
import { useBranch } from "@/contexts/BranchContext";
import { useMemo } from "react";

export default function PortalTerms() {
  const { tenant } = useTenantFromSlug();
  const { activeBranch } = useBranch();
  const { html, updatedAt, isLoading } = useLegalDocument(tenant?.id ?? null, "terms");

  const content = useMemo(() => {
    const base =
      html ||
      (tenant
        ? defaultTermsHtml({ tenant_name: tenant.name, country: "South Africa" })
        : "");
    if (!base) return "";
    return interpolateLegal(
      base,
      {
        tenant_name: tenant?.name ?? "",
        country: "South Africa",
        branch_name: activeBranch?.name ?? tenant?.name ?? "",
        branch_phone: (activeBranch as any)?.phone ?? "",
        branch_email: (activeBranch as any)?.email ?? "",
        branch_address: (activeBranch as any)?.address ?? "",
        branch_website: (activeBranch as any)?.website_url ?? "",
      },
      { strip: true },
    );
  }, [html, tenant, activeBranch]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activeBranch?.name ?? tenant?.name ?? "This storefront"}
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
