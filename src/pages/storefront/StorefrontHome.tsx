import { useNavigate } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useStorefrontPages } from "@/hooks/useStorefrontPages";
import { useStorefrontCatalogue } from "@/hooks/useStorefrontCatalogue";
import { useStorefrontPrice } from "@/hooks/useStorefrontPrice";
import AssuranceBar from "@/components/storefront/AssuranceBar";
import HeroSection from "@/components/storefront/HeroSection";
import HowItWorks from "@/components/storefront/HowItWorks";
import TradeBand from "@/components/storefront/TradeBand";
import ProductStrip from "@/components/storefront/ProductStrip";
import CategoryCard from "@/components/storefront/CategoryCard";
import StorefrontFooterStrip from "@/components/storefront/StorefrontFooterStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { familyImage } from "@/lib/storefront/productImages";
import { startOrderPath, type StorefrontFamily } from "@/lib/storefront/catalogue";
import { useShowCategoryCounts } from "@/hooks/useShowCategoryCounts";

export default function StorefrontHome() {
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const { tenantId } = useTenantContext();
  const { config, isPageEnabled } = useStorefrontPages(tenantId);
  const { data: branding } = useTenantBranding(tenantId ?? null);
  const { entries, categories, isLoading } = useStorefrontCatalogue();
  const { format } = useStorefrontPrice();
  const showCategoryCounts = useShowCategoryCounts();

  const shopEnabled = isPageEnabled("shop");
  const featured = entries.slice(0, 6);

  const openFamily = (family: StorefrontFamily) =>
    navigate(
      tenantPath(isPageEnabled("product") ? `shop/${family.slug}` : startOrderPath(family)),
    );

  /** Category tile image: category image, else first product image in it. */
  const categoryImage = (categoryId: string) => {
    const entry = entries.find((e) => e.category.id === categoryId);
    return entry ? familyImage(entry.family, config.images) : null;
  };

  return (
    <div className="dc-storefront">
      <AssuranceBar items={config.assurance_items} />

      <HeroSection
        config={config}
        heroImageUrl={branding?.hero_image_url}
        onPrimary={() => navigate(tenantPath(shopEnabled ? "shop" : "orders/new"))}
        onSecondary={() => navigate(tenantPath(shopEnabled ? "shop" : "orders/new"))}
      />

      <section className="border-t py-3">
        <div className="sf-container">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} className="h-[214px] rounded-xl" />
              ))}
            </div>
          ) : categories.length ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((category) => (
                <CategoryCard
                  key={category.id}
                  name={category.name}
                  description={category.description}
                  imageUrl={category.image_url ?? categoryImage(category.id)}
                  count={category.count}
                  showCount={showCategoryCounts}
                  onClick={() =>
                    navigate(tenantPath(shopEnabled ? `shop/c/${category.slug}` : "orders/new"))
                  }
                />
              ))}
            </div>
          ) : (
            <ProductStrip
              items={featured.map(({ family, fromPrice }) => ({
                family,
                imageUrl: familyImage(family, config.images),
                fromPriceLabel: format(fromPrice),
              }))}
              onSelect={openFamily}
            />
          )}
        </div>
      </section>

      <HowItWorks heading={config.how_it_works_heading} steps={config.how_it_works} />

      <TradeBand
        heading={config.trade_heading}
        body={config.trade_body}
        cta={config.trade_cta}
        benefits={config.trade_benefits}
        onClick={() => navigate(tenantPath("account"))}
      />

      <StorefrontFooterStrip items={config.footer_items} note={config.footer_note} />
    </div>
  );
}
