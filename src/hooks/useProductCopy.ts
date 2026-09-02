import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Per-product storefront copy (the three information sections on a product
 * page). Stored as one JSON blob per tenant in `tenant_settings`
 * (category `storefront`, key `product_copy`) so tenant admins can edit it
 * and anonymous storefront visitors can read it under existing RLS.
 */

export type ProductCopySectionKey = "specs" | "artwork" | "delivery";

export interface ProductCopySection {
  title: string;
  body: string;
  enabled: boolean;
}

export type ProductCopyEntry = Partial<Record<ProductCopySectionKey, Partial<ProductCopySection>>>;
export type ProductCopyMap = Record<string, ProductCopyEntry>;

export const PRODUCT_COPY_SECTIONS: {
  key: ProductCopySectionKey;
  defaultTitle: string;
  hint: string;
}[] = [
  {
    key: "specs",
    defaultTitle: "Specifications",
    hint: "Defaults to the list of available sizes for this product.",
  },
  {
    key: "artwork",
    defaultTitle: "Artwork requirements",
    hint: "Defaults to the standard print-ready PDF / preflight wording.",
  },
  {
    key: "delivery",
    defaultTitle: "Turnaround & delivery",
    hint: "Defaults to your storefront turnaround, delivery and collection notes.",
  },
];

export const DEFAULT_ARTWORK_BODY =
  "Supply print-ready PDF. We automatically preflight every file for size, bleed, fonts and image resolution, and flag anything that needs attention before print.";

export function defaultSpecsBody(sizes: string[]): string {
  return sizes.length
    ? `Available sizes: ${sizes.join(", ")}.`
    : "Sizes and materials are confirmed during configuration.";
}

export function defaultDeliveryBody(notes: {
  turnaround_note: string;
  delivery_note: string;
  collect_note: string;
}): string {
  return `${notes.turnaround_note}. ${notes.delivery_note} or ${notes.collect_note.toLowerCase()}.`;
}

export interface ResolvedSection extends ProductCopySection {
  key: ProductCopySectionKey;
}

/** Merge saved overrides with the computed defaults for one product family. */
export function resolveProductCopy(
  entry: ProductCopyEntry | undefined,
  defaults: Record<ProductCopySectionKey, string>,
): ResolvedSection[] {
  return PRODUCT_COPY_SECTIONS.map(({ key, defaultTitle }) => {
    const saved = entry?.[key];
    return {
      key,
      title: saved?.title?.trim() || defaultTitle,
      body: saved?.body?.trim() || defaults[key],
      enabled: saved?.enabled !== false,
    };
  });
}

const KEY = "storefront_product_copy";

export function useProductCopy(tenantId: string | null | undefined) {
  const query = useQuery({
    queryKey: [KEY, tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("setting_value")
        .eq("tenant_id", tenantId!)
        .eq("category", "storefront")
        .eq("setting_key", "product_copy")
        .maybeSingle();
      if (error) throw error;
      return (data?.setting_value ?? {}) as unknown;
    },
  });

  const map = useMemo<ProductCopyMap>(() => {
    const raw = query.data;
    return raw && typeof raw === "object" ? (raw as ProductCopyMap) : {};
  }, [query.data]);

  const entryFor = useCallback(
    (familyId: string | null | undefined): ProductCopyEntry =>
      (familyId ? map[familyId] : undefined) ?? {},
    [map],
  );

  return { map, entryFor, isLoading: query.isLoading };
}

export function useSaveProductCopy(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      map,
      familyId,
      entry,
    }: {
      map: ProductCopyMap;
      familyId: string;
      entry: ProductCopyEntry;
    }) => {
      if (!tenantId) throw new Error("No tenant selected");
      const next: ProductCopyMap = { ...map, [familyId]: entry };
      const { error } = await supabase.from("tenant_settings").upsert(
        {
          tenant_id: tenantId,
          category: "storefront",
          setting_key: "product_copy",
          setting_value: next as never,
          value_type: "json",
          is_sensitive: false,
        },
        { onConflict: "tenant_id,category,setting_key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, tenantId] });
    },
  });
}
