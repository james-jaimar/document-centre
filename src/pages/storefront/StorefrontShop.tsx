import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useStorefrontPages } from "@/hooks/useStorefrontPages";
import { useStorefrontCatalogue } from "@/hooks/useStorefrontCatalogue";
import { useStorefrontPrice } from "@/hooks/useStorefrontPrice";
import ProductCard from "@/components/storefront/ProductCard";
import CategoryCard from "@/components/storefront/CategoryCard";
import ShopFilters, {
  type FilterOption,
  type ShopFilterState,
} from "@/components/storefront/ShopFilters";
import AssuranceBar from "@/components/storefront/AssuranceBar";
import StorefrontFooterStrip from "@/components/storefront/StorefrontFooterStrip";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { familyImage } from "@/lib/storefront/productImages";
import { isEditableFamily, startOrderPath } from "@/lib/storefront/catalogue";
import { getFamilyKind } from "@/lib/products/familyKind";
import { useShowCategoryCounts } from "@/hooks/useShowCategoryCounts";

type SortKey = "featured" | "price_asc" | "price_desc" | "name";

const humanise = (v: string) =>
  v.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function counted(values: string[], labeller: (v: string) => string): FilterOption[] {
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labeller(value), count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export default function StorefrontShop() {
  const navigate = useNavigate();
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const { tenantPath } = useTenantSlug();
  const { tenantId } = useTenantContext();
  const { config, isPageEnabled } = useStorefrontPages(tenantId);
  const { entries: allEntries, categories, isLoading } = useStorefrontCatalogue();
  const { format } = useStorefrontPrice();
  const showCategoryCounts = useShowCategoryCounts();
  const [sort, setSort] = useState<SortKey>("featured");
  const [view, setView] = useState<"grid" | "list">("grid");

  const activeCategory = categorySlug
    ? categories.find((c) => c.slug === categorySlug) ?? null
    : null;
  /** Show category tiles on /shop when categories exist and none is selected. */
  const showCategoryIndex = !categorySlug && categories.length > 1;
  const entries = useMemo(
    () => (activeCategory ? allEntries.filter((e) => e.category.id === activeCategory.id) : allEntries),
    [allEntries, activeCategory],
  );

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

  const typeOptions = useMemo(
    () => counted(entries.map((e) => getFamilyKind(e.family as any) || "print"), humanise),
    [entries],
  );
  const sizeOptions = useMemo(
    () => counted(entries.flatMap((e) => e.sizes), (v) => v.toUpperCase()),
    [entries],
  );
  const orderingOptions = useMemo(
    () =>
      counted(
        entries.map((e) => (isEditableFamily(e.family) ? "Customise online" : "Upload artwork")),
        (v) => v,
      ),
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
    <div className="dc-storefront">
      <AssuranceBar items={config.assurance_items} />

      <div className="sf-container py-9">
        {activeCategory && (
          <nav className="mb-3 text-xs text-muted-foreground" aria-label="Breadcrumb">
            <Link to={tenantPath("shop")} className="hover:text-foreground">
              Shop
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-foreground">{activeCategory.name}</span>
          </nav>
        )}
        <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="sf-section-title text-foreground">
              {activeCategory ? activeCategory.name : config.shop_heading}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeCategory ? activeCategory.description ?? config.shop_subcopy : config.shop_subcopy}
            </p>
          </div>
          {config.pricing_note && (
            <p className="text-xs text-muted-foreground">{config.pricing_note}</p>
          )}
        </header>

        {showCategoryIndex ? (
          isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-56 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((c) => (
                <CategoryCard
                  key={c.id}
                  name={c.name}
                  description={c.description}
                  imageUrl={c.image_url}
                  count={c.count}
                  showCount={showCategoryCounts}
                  onClick={() => navigate(tenantPath(`shop/c/${c.slug}`))}
                />
              ))}
            </div>
          )
        ) : (


        <div className="grid gap-8 lg:grid-cols-[256px_1fr]">
          <ShopFilters
            types={typeOptions}
            sizes={sizeOptions}
            ordering={orderingOptions}
            priceCeiling={priceCeiling}
            value={{ ...filters, maxPrice: activeMax }}
            onChange={setFilters}
            formatPriceLabel={(v) => format(v) ?? String(v)}
          />

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {isLoading
                  ? "Loading…"
                  : `${visible.length} product${visible.length === 1 ? "" : "s"}`}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Sort by</span>
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="h-9 w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="featured">Featured</SelectItem>
                    <SelectItem value="price_asc">Price: low to high</SelectItem>
                    <SelectItem value="price_desc">Price: high to low</SelectItem>
                    <SelectItem value="name">Name A–Z</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex overflow-hidden rounded-md border">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Grid view"
                    className={cn("h-9 w-9 rounded-none", view === "grid" && "bg-muted")}
                    onClick={() => setView("grid")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="List view"
                    className={cn("h-9 w-9 rounded-none border-l", view === "list" && "bg-muted")}
                    onClick={() => setView("list")}
                  >
                    <Rows3 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
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
              <div
                className={cn(
                  "grid gap-5",
                  view === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1",
                )}
              >
                {visible.map(({ family, fromPrice }) => (
                  <ProductCard
                    key={family.id}
                    family={family}
                    view={view}
                    imageUrl={familyImage(family, config.images)}
                    fromPriceLabel={format(fromPrice)}
                    turnaround={config.turnaround_note}
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
        )}
      </div>


      <StorefrontFooterStrip items={config.footer_items} note={config.footer_note} />
    </div>
  );
}
