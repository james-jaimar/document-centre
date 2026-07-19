import { useProductFamilies } from "@/hooks/useProductFamilies";
import { useProductVariantLinks } from "@/hooks/useCatalogVariants";
import VariantPricingMatrix from "@/components/admin/VariantPricingMatrix";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  tenantId: string;
  branchId: string;
}

/**
 * Renders a per-product-family variant pricing matrix at branch scope.
 * Only families that have variant links appear. Missing rows can be pulled
 * via the "Pull missing from tenant" action in the Click Charges section.
 */
export default function BranchVariantPricingSection({ tenantId, branchId }: Props) {
  const { data: families = [], isLoading } = useProductFamilies(tenantId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Loading product variants…
        </CardContent>
      </Card>
    );
  }

  const familiesToShow = families;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Variant pricing per product</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
          Products that offer variants (e.g. Economy vs Executive for pull-up banners) show a
          size × variant matrix below. If a variant is missing, click "Pull missing from tenant"
          in the Click Charges section above.
        </p>
      </div>

      {familiesToShow.map((family) => (
        <FamilyVariantBlock
          key={family.id}
          familyId={family.id}
          familyName={family.name}
          tenantId={tenantId}
          branchId={branchId}
        />
      ))}
    </div>
  );
}

function FamilyVariantBlock({
  familyId,
  familyName,
  tenantId,
  branchId,
}: {
  familyId: string;
  familyName: string;
  tenantId: string;
  branchId: string;
}) {
  const { data: links = [] } = useProductVariantLinks(familyId);
  if (links.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{familyName}</CardTitle>
      </CardHeader>
      <CardContent>
        <VariantPricingMatrix
          productFamilyId={familyId}
          variantLinks={links}
          scope="branch"
          tenantId={tenantId}
          branchId={branchId}
        />
      </CardContent>
    </Card>
  );
}
