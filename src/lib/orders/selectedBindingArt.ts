import type { StructuredOptionValue } from "@/lib/productOptionTypes";
import { isStructuredValues } from "@/lib/productOptionTypes";
import type { BindingMethod } from "@/components/preview/bindingAssets";

interface OptionLike {
  name: string;
  values: unknown;
}

/**
 * Extract the binding artwork descriptor (method + raw color label) from
 * the currently-selected Binding option. Returns undefined when no binding
 * is selected, the option is unrecognised, or the method is one we don't
 * render spine artwork for (e.g. ring binders, perfect binding).
 *
 * Single source of truth: used by both the live builder preview and the
 * saved/admin preview snapshot so they always agree.
 */
export function selectedBindingArt(
  selectedOptions: Record<string, string>,
  productOptions: OptionLike[],
): { method: BindingMethod; color: string } | undefined {
  const bindingOpt = productOptions.find(
    (o) => o.name.toLowerCase() === "binding",
  );

  const key = bindingOpt
    ? (Object.keys(selectedOptions).find(
        (k) => k.toLowerCase() === bindingOpt.name.toLowerCase(),
      ) ?? bindingOpt.name)
    : Object.keys(selectedOptions).find((k) => k.toLowerCase() === "binding");
  const slug = key ? selectedOptions[key] : undefined;
  if (!slug) return undefined;

  if (bindingOpt && isStructuredValues(bindingOpt.values)) {
    const matched = (bindingOpt.values as StructuredOptionValue[]).find(
      (v) => v.slug === slug,
    );
    const method = matched?.metadata?.binding_method as string | undefined;
    const color = (matched?.metadata?.color as string | undefined) ?? "black";

    if (method === "spiral" || method === "comb" || method === "twin_loop") {
      return { method, color };
    }
  }

  // Fallback: catalog-backed Binding options often have empty `values` on
  // the raw product_options row (enrichment happens client-side via
  // useCatalogBackedOptions). Map seeded master catalog slugs directly so
  // both write-time (useCart) and read-time (admin/customer panels) can
  // resolve binding artwork without depending on enrichment.
  return bindingArtFromSlug(slug);
}

const SLUG_TO_ART: Record<
  string,
  { method: BindingMethod; color: string }
> = {
  "comb-black": { method: "comb", color: "Black" },
  "spiral-black": { method: "spiral", color: "Black" },
  "spiral-white": { method: "spiral", color: "White" },
  "spiral-clear": { method: "spiral", color: "Clear" },
  "wire-black": { method: "twin_loop", color: "Black" },
  "wire-silver": { method: "twin_loop", color: "Silver" },
};

export function bindingArtFromSlug(
  slug?: string | null,
): { method: BindingMethod; color: string } | undefined {
  if (!slug) return undefined;
  return SLUG_TO_ART[slug];
}
