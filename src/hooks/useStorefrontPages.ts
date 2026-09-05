import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Per-tenant "ecommerce storefront pages" configuration.
 *
 * This is a PLATFORM-ADMIN controlled capability: tenants cannot enable or
 * edit it. The config is stored as a single JSON row in `tenant_settings`
 * (category `storefront`, key `config`). Reads are public (the storefront
 * needs them for anonymous visitors); writes are restricted to platform
 * admins by RLS.
 */

export interface StorefrontAssuranceItem {
  icon: string;
  title: string;
  subtitle: string;
}

export interface StorefrontStep {
  title: string;
  body: string;
}

export interface StorefrontSizeChip {
  label: string;
  dimensions: string;
  /** Relative visual size of the outlined rectangle, 1–10. */
  scale: number;
  highlight: boolean;
}

export interface StorefrontSizeCompare {
  heading: string;
  body: string;
  items: StorefrontSizeChip[];
}

export interface StorefrontFeatureCard {
  title: string;
  body: string;
  image_url: string;
  link_label: string;
  /** Path relative to the tenant root, e.g. "shop/desk-pads". */
  link_path: string;
}

export interface StorefrontWideBanner {
  heading: string;
  body: string;
  cta_label: string;
  cta_path: string;
  image_url: string;
  image_side: "left" | "right";
  /** 0–100 darkening over the image so copy stays readable. */
  overlay: number;
}

export type StorefrontSectionKey =
  | "products"
  | "size_compare"
  | "feature_cards"
  | "wide_banner"
  | "how_it_works"
  | "trade"
  | "assurance_footer";

export interface StorefrontPagesConfig {
  enabled: boolean;
  pages: {
    landing: boolean;
    shop: boolean;
    product: boolean;
    editor: boolean;
  };
  assurance_items: StorefrontAssuranceItem[];
  hero_eyebrow: string;
  hero_heading: string;
  hero_subcopy: string;
  hero_cta_primary: string;
  hero_cta_secondary: string;
  hero_image_url: string;
  /** "split" = image in the right column, "full" = full-width image with copy overlaid. */
  hero_layout: "split" | "full";
  /** Hero depth. */
  hero_height: "standard" | "tall" | "screen";
  hero_align: "left" | "center" | "right";
  hero_secondary_style: "button" | "link";
  /** Short facts under the hero CTAs, shown divided by rules. */
  hero_spec_items: string[];
  size_compare: StorefrontSizeCompare;
  feature_cards: StorefrontFeatureCard[];
  wide_banner: StorefrontWideBanner;
  /** Landing section order + visibility (omitted keys are hidden). */
  section_order: StorefrontSectionKey[];
  /** Heading typeface inside the storefront only. */
  heading_font: "sans" | "serif";
  strip_heading: string;
  strip_subcopy: string;
  how_it_works_heading: string;
  how_it_works: StorefrontStep[];
  trade_heading: string;
  trade_body: string;
  trade_cta: string;
  trade_benefits: string[];
  shop_heading: string;
  shop_subcopy: string;
  pricing_note: string;
  turnaround_note: string;
  delivery_note: string;
  collect_note: string;
  footer_items: string[];
  footer_note: string;
  /** Per product-family gallery images (family id -> image urls). */
  images: Record<string, string[]>;
}

export const STOREFRONT_SECTION_KEYS: StorefrontSectionKey[] = [
  "products",
  "size_compare",
  "feature_cards",
  "wide_banner",
  "how_it_works",
  "trade",
  "assurance_footer",
];

export const STOREFRONT_SECTION_LABELS: Record<StorefrontSectionKey, string> = {
  products: "Products / categories",
  size_compare: "Size comparison",
  feature_cards: "Feature cards",
  wide_banner: "Wide banner",
  how_it_works: "How it works",
  trade: "Trade band",
  assurance_footer: "Footer strip",
};


export const STOREFRONT_PAGES_DEFAULTS: StorefrontPagesConfig = {
  enabled: false,
  pages: { landing: true, shop: true, product: true, editor: true },
  assurance_items: [
    { icon: "truck", title: "Nationwide delivery", subtitle: "Or collect in store" },
    { icon: "shield", title: "Print-ready checks", subtitle: "Every file preflighted" },
    { icon: "clock", title: "Fast turnaround", subtitle: "Most jobs in 2–3 days" },
  ],
  hero_eyebrow: "Branded calendars & print",
  hero_heading: "Print that keeps your brand in view all year",
  hero_subcopy:
    "Design online in minutes or upload your own artwork. Trade pricing, proofing and delivery handled for you.",
  hero_cta_primary: "Start designing",
  hero_cta_secondary: "Browse the shop",
  hero_image_url: "",
  hero_layout: "split",
  hero_height: "standard",
  hero_align: "left",
  hero_secondary_style: "button",
  hero_spec_items: [],
  size_compare: { heading: "", body: "", items: [] },
  feature_cards: [],
  wide_banner: {
    heading: "",
    body: "",
    cta_label: "",
    cta_path: "",
    image_url: "",
    image_side: "right",
    overlay: 40,
  },
  section_order: ["products", "how_it_works", "trade", "assurance_footer"],
  heading_font: "sans",
  strip_heading: "",
  strip_subcopy: "",

  how_it_works_heading: "How it works",
  how_it_works: [
    { title: "Choose your product", body: "Pick a size, paper and quantity with live pricing." },
    { title: "Design or upload", body: "Use our online editor or send us your print-ready PDF." },
    { title: "Approve and print", body: "Check your proof, then we print and deliver." },
  ],
  trade_heading: "Ordering for a business?",
  trade_body: "Open a trade account for volume pricing, saved artwork and invoiced billing.",
  trade_cta: "Talk to us",
  trade_benefits: ["Volume pricing", "Saved artwork & repeat orders", "Invoiced billing"],
  shop_heading: "Shop",
  shop_subcopy: "Every product available to you, with live pricing.",
  pricing_note: "Retail prices shown incl. VAT — sign in for trade pricing",
  turnaround_note: "Typically 2–3 working days",
  delivery_note: "Nationwide courier delivery",
  collect_note: "Collect in store, free",
  footer_items: ["Secure checkout", "Card, EFT & instant EFT", "Need help? Talk to us"],
  footer_note: "",
  images: {},
};

function coerce(raw: unknown): StorefrontPagesConfig {
  const v = (raw ?? {}) as Partial<StorefrontPagesConfig>;
  return {
    ...STOREFRONT_PAGES_DEFAULTS,
    ...v,
    pages: { ...STOREFRONT_PAGES_DEFAULTS.pages, ...(v.pages ?? {}) },
    assurance_items: v.assurance_items?.length
      ? v.assurance_items
      : STOREFRONT_PAGES_DEFAULTS.assurance_items,
    how_it_works: v.how_it_works?.length
      ? v.how_it_works
      : STOREFRONT_PAGES_DEFAULTS.how_it_works,
    trade_benefits: v.trade_benefits?.length
      ? v.trade_benefits
      : STOREFRONT_PAGES_DEFAULTS.trade_benefits,
    footer_items: v.footer_items?.length
      ? v.footer_items
      : STOREFRONT_PAGES_DEFAULTS.footer_items,
    hero_spec_items: v.hero_spec_items ?? [],
    size_compare: {
      ...STOREFRONT_PAGES_DEFAULTS.size_compare,
      ...(v.size_compare ?? {}),
      items: v.size_compare?.items ?? [],
    },
    feature_cards: v.feature_cards ?? [],
    wide_banner: { ...STOREFRONT_PAGES_DEFAULTS.wide_banner, ...(v.wide_banner ?? {}) },
    section_order: v.section_order?.length
      ? v.section_order
      : STOREFRONT_PAGES_DEFAULTS.section_order,

    images: v.images ?? {},
  };
}


const KEY = "storefront_pages_config";

export function useStorefrontPages(tenantId: string | null | undefined) {
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
        .eq("setting_key", "config")
        .maybeSingle();
      if (error) throw error;
      return (data?.setting_value ?? null) as unknown;
    },
  });

  const config = useMemo(() => coerce(query.data), [query.data]);

  return {
    config,
    /** True only when the master switch AND the specific page are on. */
    isPageEnabled: (page: keyof StorefrontPagesConfig["pages"]) =>
      config.enabled && config.pages[page],
    isLoading: query.isLoading,
    isFetched: query.isFetched,
  };
}

export function useSaveStorefrontPages(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: StorefrontPagesConfig) => {
      if (!tenantId) throw new Error("No tenant selected");
      const { error } = await supabase.from("tenant_settings").upsert(
        {
          tenant_id: tenantId,
          category: "storefront",
          setting_key: "config",
          setting_value: config as any,
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
