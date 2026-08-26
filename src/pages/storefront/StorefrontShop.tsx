import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useStorefrontPages } from "@/hooks/useStorefrontPages";
import { useStorefrontCatalogue } from "@/hooks/useStorefrontCatalogue";
import { useStorefrontPrice } from "@/hooks/useStorefrontPrice";
import ProductCard from "@/components/storefront/ProductCard";
import ShopFilters, { type ShopFilterState } from "@/components/storefront/ShopFilters";
import AssuranceBar from "@/components/storefront/AssuranceBar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { familyImage } from "@/lib/storefront/productImages";
import { isEditableFamily, startOrderPath } from "@/lib/storefront/catalogue";
import { getFamilyKind } from "@/lib/products/familyKind";

type SortKey = "featured" | "price_asc" | "price_desc" | "name";

export default function StorefrontShop() {
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const { tenantId } = useTenantContext();
  const { config, isPageEnabled } = useStorefrontPages(tenantId);
  const { entries, isLoading } = useStorefrontCatalogue();
  const { format } = useStorefrontPrice();
  const [sort, setSort] = useState<SortKey>("featured");

  const priceCeiling = useMemo(() => {
    const max = Math.max(0, ...entries.map((e) => e.fromPrice ?? 0));
    return max > 0 ? Math.ceil(max) : 0;
  }, [entries]);

  const [filters, setFilters] = useState<ShopFilterState>({
    types: [],
    sizes: [],
    ordering: [],
    maxPrice: 0,
  });
  const activeMax = filters.maxPrice || priceCeiling;

  const types = useMemo(
    () => [...new Set(entries.map((e) => getFamilyKind(e.family as any) || "print"))].sort(),
    [entries],
  );
  const sizes = useMemo(
    () => [...new Set(entries.flatMap((e) => e.sizes))].sort(),
    [entries],
  );

  const visible = useMemo(() => {
    const list = entries.filter(({ family, fromPrice, sizes: fSizes }) => {
      if (filters.types.length && !filters.types.includes(getFamilyKind(family as any) || "print"))
        return false;
      if (filters.sizes.length && !fSizes.some((s) => filters.sizes.includes(s))) return false;
      if (filters.ordering.length) {
        const label = isEditableFamily(family) ? "Customise online" : "Upload artwork";
        if (!filters.ordering.includes(label)) return false;
      }
      if (priceCeiling && fromPrice != null && fromPrice > activeMax) return false;
      return true;
    });

    const sorted = [...list];
    if (sort === "price_asc")
      sorted.sort((a, b) => (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity));
    if (sort === "price_desc")
      sorted.sort((a, b) => (b.fromPrice ?? -1) - (a.fromPrice ?? -1));
    if (sort === "name") sorted.sort((a, b) => a.family.name.localeCompare(b.family.name));
    return sorted;
  }, [entries, filters, sort, activeMax, priceCeiling]);

  return (
    <div className="dc-storefront -mx-4 -my-4 md:-mx-6 md:-my-6">
      <AssuranceBar items={config.assurance_items} />

      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Shop</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every product available to you, with live pricing.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <ShopFilters
            types={types}
            sizes={sizes}
            priceCeiling={priceCeiling}
            value={{ ...filters, maxPrice: activeMax }}
            onChange={setFilters}
            formatPriceLabel={(v) => format(v) ?? String(v)}
          />

          <div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {isLoading ? "Loading…" : `${visible.length} product${visible.length === 1 ? "" : "s"}`}
              </p>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="price_asc">Price: low to high</SelectItem>
                  <SelectItem value="price_desc">Price: high to low</SelectItem>
                  <SelectItem value="name">Name A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-72 rounded-xl" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
                No products match these filters.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map(({ family, fromPrice }) => (
                  <ProductCard
                    key={family.id}
                    family={family}
                    imageUrl={familyImage(family)}
                    fromPriceLabel={format(fromPrice)}
                    onView={() =>
                      navigate(
                        tenantPath(
                          isPageEnabled("product") ? `shop/${family.slug}` : startOrderPath(family),
                        ),
                      )
                    }
                    onStart={() => navigate(tenantPath(startOrderPath(family)))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
