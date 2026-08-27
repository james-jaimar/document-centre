# Storefront product categories

Add a master category layer above product families, and use it to organise the storefront shop pages the way the legacy system does: categories first, then the products inside each category.

## Data

New master table `product_categories`: name, slug, description, image, sort order, active flag. Platform-defined only (one shared list, tenants inherit it).

Product families get a `category_id` link. Families with no category fall into an "Other" group so nothing disappears while categories are being set up.

Categories shown on a tenant storefront are derived from that tenant's visible products: a category with no visible products for the tenant/branch is hidden automatically.

## Platform admin

- New "Categories" screen under the master product area: create/edit/delete categories, set image, description and order (drag or up/down).
- Product family edit gains a Category selector.
- Deleting a category leaves its products uncategorised rather than deleting them.

## Storefront

**Shop index (`/shop`)** — category tiles matching the reference layout: image, category name, and a count badge of products in that category. Tiles use the category image, falling back to the first product image in that category, then a neutral placeholder.

**Category page (`/shop/:categorySlug`)** — breadcrumb (Shop / Category), heading and description, then the existing product grid/list, filters, sort and toolbar scoped to that category.

**Filters** — the existing filter sidebar gains a "Category" group, so a customer landing on a category page can switch or widen the selection without going back.

**Product page** — breadcrumb becomes Shop / Category / Product.

Landing-page product strip is unchanged (still the flat "featured products" row).

## Technical notes

- Migration: `product_categories` (public read, platform-admin write, with GRANTs), `product_families.category_id` FK with `on delete set null`.
- New hook `useProductCategories` (master list) and an extension of `useStorefrontCatalogue` to return `categories` (only those with visible entries) plus per-entry `category`.
- New page `src/pages/storefront/StorefrontCategory.tsx`; `StorefrontShop.tsx` becomes the category index when categories exist and falls back to today's full product grid when none are defined.
- New component `src/components/storefront/CategoryCard.tsx`; `ShopFilters` gains a category group; `ProductCard` unchanged.
- Routes added inside `customerRoutes()` so `/t/:slug/shop/:categorySlug` and subdomain hosts both work.
- Styling stays on the existing `.dc-storefront` tokens and shadcn components.

## Out of scope

Per-tenant category overrides (hide/rename per tenant), nested sub-categories, category-level SEO copy.
