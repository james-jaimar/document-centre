import { useNavigate } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, FileText, Layers, Printer, Presentation, Image, Newspaper } from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";
import { useBranchCapabilities } from "@/hooks/useBranchCapabilities";

import boundDocumentsImg from "@/assets/products/bound-documents.jpg";
import presentationsImg from "@/assets/products/presentations.jpg";
import ringBindersImg from "@/assets/products/ring-binders.jpg";
import stapledLooseImg from "@/assets/products/stapled-loose.jpg";
import postersImg from "@/assets/products/posters.jpg";
import bookletsImg from "@/assets/products/booklets.jpg";
import flyersImg from "@/assets/products/flyers.jpg";
import brochuresImg from "@/assets/products/brochures.jpg";
import businessCardsImg from "@/assets/product-business-cards.jpg";
import photoPrintsImg from "@/assets/products/photo-prints.jpg";

const SLUG_IMAGE_MAP: Record<string, string> = {
  "bound-documents": boundDocumentsImg,
  "presentations": presentationsImg,
  "ring-binders": ringBindersImg,
  "stapled-loose-pages": stapledLooseImg,
  "posters": postersImg,
  "booklets": bookletsImg,
  "flyers": flyersImg,
  "brochures": brochuresImg,
  "business-cards": businessCardsImg,
  "photo-prints": photoPrintsImg,
};

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen,
  FileText,
  Layers,
  Printer,
  Presentation,
  Image,
  BookText: FileText,
  Newspaper,
};

export default function NewOrder() {
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const { activeBranch } = useBranch();
  const { data: capabilities } = useBranchCapabilities(activeBranch?.id ?? null);
  const tenantId = activeBranch?.tenant_id ?? null;

  const { data: families, isLoading } = useQuery({
    queryKey: ["product_families_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select("*")
        .is("tenant_id", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: tenantToggles } = useQuery({
    queryKey: ["tenant_product_toggles_public", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_product_toggles" as any)
        .select("product_family_id,is_enabled")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return (data ?? []) as unknown as { product_family_id: string; is_enabled: boolean }[];
    },
  });

  const tenantDisabled = new Set(
    (tenantToggles ?? []).filter((t) => !t.is_enabled).map((t) => t.product_family_id)
  );

  // Filter: tenant toggle (default ON) → branch capability
  const filteredFamilies = families?.filter((family) => {
    if (tenantDisabled.has(family.id)) return false;
    if (!activeBranch || !capabilities || capabilities.length === 0) return true;
    const cap = capabilities.find((c) => c.product_family_id === family.id);
    if (!cap) return false;
    return cap.is_enabled && !cap.temporary_outage;
  });

  const handleSelect = (familyId: string, familySlug: string) => {
    if (familySlug === "photo-prints") {
      navigate(tenantPath("orders/new/photo-prints"));
      return;
    }
    navigate(tenantPath(`orders/new/${familyId}`));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">New Order</h1>
        <p className="text-muted-foreground mt-1">
          Choose a product type to get started
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredFamilies?.map((family) => {
            const heroImage = family.image_url || SLUG_IMAGE_MAP[family.slug];
            const Icon = ICON_MAP[family.icon ?? ""] ?? FileText;

            return (
              <Card
                key={family.id}
                className="cursor-pointer border-2 border-transparent hover:border-primary/50 hover:shadow-lg transition-all group overflow-hidden"
                onClick={() => handleSelect(family.id, family.slug)}
              >
                {heroImage ? (
                  <div className="relative h-36 overflow-hidden bg-muted">
                    <img
                      src={heroImage}
                      alt={family.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      width={400}
                      height={144}
                    />
                  </div>
                ) : (
                  <div className="h-36 flex items-center justify-center bg-primary/5 group-hover:bg-primary/10 transition-colors">
                    <Icon className="h-14 w-14 text-primary/60" />
                  </div>
                )}
                <CardContent className="p-4 text-center">
                  <h3 className="font-semibold text-foreground text-base">
                    {family.name}
                  </h3>
                  {family.description && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                      {family.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && (!filteredFamilies || filteredFamilies.length === 0) && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No product types available yet.</p>
        </div>
      )}
    </div>
  );
}
