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
  if (!bindingOpt || !isStructuredValues(bindingOpt.values)) return undefined;

  const key =
    Object.keys(selectedOptions).find(
      (k) => k.toLowerCase() === bindingOpt.name.toLowerCase(),
    ) ?? bindingOpt.name;
  const slug = selectedOptions[key];
  if (!slug) return undefined;

  const matched = (bindingOpt.values as StructuredOptionValue[]).find(
    (v) => v.slug === slug,
  );
  const method = matched?.metadata?.binding_method as string | undefined;
  const color = (matched?.metadata?.color as string | undefined) ?? "black";

  if (method === "spiral" || method === "comb" || method === "twin_loop") {
    return { method, color };
  }
  return undefined;
}
