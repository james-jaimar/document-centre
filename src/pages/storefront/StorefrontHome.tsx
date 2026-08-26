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
import ProductCard from "@/components/storefront/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { familyImage } from "@/lib/storefront/productImages";
import { startOrderPath } from "@/lib/storefront/catalogue";

export default function StorefrontHome() {
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const { tenantId } = useTenantContext();
  const { config, isPageEnabled } = useStorefrontPages(tenantId);
  const { data: branding } = useTenantBranding(tenantId ?? null);
  const { entries, isLoading } = useStorefrontCatalogue();
  const { format } = useStorefrontPrice();

  const shopEnabled = isPageEnabled("shop");
  const featured = entries.slice(0, 8);

  return (
    <div className="dc-storefront -mx-4 -my-4 md:-mx-6 md:-my-6">
      <AssuranceBar items={config.assurance_items} />

      <HeroSection
        config={config}
        heroImageUrl={branding?.hero_image_url}
        onPrimary={() => navigate(tenantPath(shopEnabled ? "shop" : "orders/new"))}
        onSecondary={() => navigate(tenantPath(shopEnabled ? "shop" : "orders/new"))}
      />

      <section className="py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground md:text-3xl">Popular products</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Live pricing, proofing and delivery on every order.
              </p>
            </div>
            {shopEnabled && (
              <Button variant="outline" onClick={() => navigate(tenantPath("shop"))}>
                View all
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-72 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map(({ family, fromPrice }) => (
                <ProductCard
                  key={family.id}
                  family={family}
                  imageUrl={familyImage(family)}
                  fromPriceLabel={format(fromPrice)}
                  onView={() =>
                    navigate(
                      tenantPath(
                        isPageEnabled("product")
                          ? `shop/${family.slug}`
                          : startOrderPath(family),
                      ),
                    )
                  }
                  onStart={() => navigate(tenantPath(startOrderPath(family)))}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <HowItWorks heading={config.how_it_works_heading} steps={config.how_it_works} />

      <TradeBand
        heading={config.trade_heading}
        body={config.trade_body}
        cta={config.trade_cta}
        onClick={() => navigate(tenantPath("account"))}
      />

      {config.footer_note && (
        <p className="border-t px-6 py-6 text-center text-xs text-muted-foreground">
          {config.footer_note}
        </p>
      )}
    </div>
  );
}
