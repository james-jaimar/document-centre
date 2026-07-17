import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Belt-and-braces: on first branch-portal render for a branch, ask the DB
 * to seed catalogue + rate-card rows from the tenant if it hasn't already.
 * The RPC is idempotent (short-circuits via `branches.pricing_seeded_at`)
 * so this is effectively free after the first hit.
 */
const seededThisSession = new Set<string>();

export function useEnsureBranchPricingSeeded(branchId: string | null | undefined) {
  const qc = useQueryClient();
  const inflight = useRef<string | null>(null);

  useEffect(() => {
    if (!branchId) return;
    if (seededThisSession.has(branchId)) return;
    if (inflight.current === branchId) return;
    inflight.current = branchId;

    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("ensure_branch_pricing_seeded", {
          _branch_id: branchId,
        });
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("ensure_branch_pricing_seeded failed", error);
          return;
        }
        seededThisSession.add(branchId);
        // Only invalidate if we actually seeded (RPC returns true on first run).
        if (data === true) {
          qc.invalidateQueries({ queryKey: ["catalog_sizes"] });
          qc.invalidateQueries({ queryKey: ["catalog_print_attrs"] });
          qc.invalidateQueries({ queryKey: ["catalog_papers"] });
          qc.invalidateQueries({ queryKey: ["catalog_finishing"] });
          qc.invalidateQueries({ queryKey: ["catalog_paper_prices"] });
          qc.invalidateQueries({ queryKey: ["catalog_finishing_prices"] });
          qc.invalidateQueries({ queryKey: ["product_catalog_links"] });
          qc.invalidateQueries({ queryKey: ["rate_card"] });
          qc.invalidateQueries({ queryKey: ["resolved_rate_card"] });
          qc.invalidateQueries({ queryKey: ["pricing_rules"] });
          qc.invalidateQueries({ queryKey: ["rate_card_price_breaks_bundle"] });
          qc.invalidateQueries({ queryKey: ["branch_onboarding"] });
        }
      } finally {
        if (inflight.current === branchId) inflight.current = null;
      }
    })();
  }, [branchId, qc]);
}
