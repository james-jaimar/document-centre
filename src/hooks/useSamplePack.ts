import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useCart } from "@/hooks/useCart";
import { resolveTradeMembership } from "@/lib/customers/tradeMembership";
import {
  SAMPLE_PACK_CATEGORY,
  SAMPLE_PACK_DEFAULTS,
  packIsComplete,
  parseSamplePackConfig,
  type SamplePackConfig,
} from "@/lib/samplePack/config";

const SETTING_KEYS = [
  "enabled",
  "price",
  "family_ids",
  "trade_only",
  "one_per_company",
  "headline",
  "blurb",
] as const;

/**
 * Storefront-visible sample pack configuration. Read through
 * `resolve_tenant_setting` so anonymous and customer sessions can see it.
 */
export function useSamplePackConfig(): { config: SamplePackConfig; isLoading: boolean } {
  const { tenantId } = useTenantContext();

  const query = useQuery({
    queryKey: ["sample-pack-config", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const entries = await Promise.all(
        SETTING_KEYS.map(async (key) => {
          const { data } = await supabase.rpc("resolve_tenant_setting" as any, {
            p_tenant_id: tenantId!,
            p_category: SAMPLE_PACK_CATEGORY,
            p_key: key,
          });
          return [key, data] as const;
        }),
      );
      return parseSamplePackConfig(Object.fromEntries(entries));
    },
  });

  return { config: query.data ?? SAMPLE_PACK_DEFAULTS, isLoading: query.isLoading };
}

export interface SamplePackState {
  config: SamplePackConfig;
  /** The offer is switched on and this signed-in customer may take it. */
  eligible: boolean;
  /** They've already had their pack (or their allowance is used up). */
  alreadyTaken: boolean;
  isTrade: boolean;
  /** Families already sitting in the cart as sample items. */
  doneFamilyIds: string[];
  complete: boolean;
  isLoading: boolean;
}

/**
 * Everything the storefront needs to decide whether to show the offer and how
 * far through it the customer is.
 */
export function useSamplePack(): SamplePackState {
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const { config, isLoading: configLoading } = useSamplePackConfig();
  const { data: cart } = useCart();

  const account = useQuery({
    queryKey: ["sample-pack-account", tenantId, user?.id],
    enabled: !!tenantId && !!user?.id && config.enabled,
    queryFn: async () => {
      const [membershipRes, takenRes] = await Promise.all([
        supabase
          .from("tenant_memberships")
          .select(
            "id, branch_id, company_id, is_active, is_trade_customer, company:company_id (id, is_active, is_trade_customer, sample_pack_allowance)",
          )
          .eq("tenant_id", tenantId!)
          .eq("profile_id", user!.id)
          .eq("is_active", true),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId!)
          .eq("user_id", user!.id)
          .eq("is_sample_pack", true)
          .neq("order_status", "cart" as any),
      ]);

      const memberships = (membershipRes.data ?? []) as any[];
      const resolved = resolveTradeMembership(memberships as any);
      const allowance = Number(
        memberships.find((m) => m.company?.sample_pack_allowance != null)?.company
          ?.sample_pack_allowance ?? 1,
      );
      return {
        isTrade: !!resolved?.is_trade_customer,
        taken: takenRes.count ?? 0,
        allowance: Number.isFinite(allowance) ? allowance : 1,
      };
    },
  });

  const doneFamilyIds = useMemo(() => {
    const items = ((cart as any)?.order_items ?? []) as any[];
    return items
      .filter((i) => (i.spec as any)?.sample_pack === true)
      .map((i) => i.product_family_id as string)
      .filter(Boolean);
  }, [cart]);

  const isTrade = account.data?.isTrade ?? false;
  const alreadyTaken =
    config.onePerCompany && (account.data ? account.data.taken >= account.data.allowance : false);

  const eligible =
    config.enabled &&
    config.familyIds.length > 0 &&
    !!user &&
    (!config.tradeOnly || isTrade) &&
    !alreadyTaken;

  return {
    config,
    eligible,
    alreadyTaken,
    isTrade,
    doneFamilyIds,
    complete: packIsComplete(config.familyIds, doneFamilyIds),
    isLoading: configLoading || account.isLoading,
  };
}
