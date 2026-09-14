import { useSamplePack } from "@/hooks/useSamplePack";

export interface SamplePackFlow {
  /** The customer is designing this item as part of their sample pack. */
  active: boolean;
  /** How many pack items are already personalised. */
  done: number;
  /** How many items the pack contains. */
  total: number;
  /** Adding this item finishes the pack. */
  completesPack: boolean;
  /** Items still to do once this one is added. */
  remainingAfterAdd: number;
}

/**
 * Progress of the sample pack from inside a design screen, so the builder can
 * send the customer back to the pack instead of dumping them in the basket.
 */
export function useSamplePackFlow(active: boolean, familyId?: string | null): SamplePackFlow {
  const { config, doneFamilyIds } = useSamplePack();
  const total = config.familyIds.length;
  const done = config.familyIds.filter((id) => doneFamilyIds.includes(id)).length;
  const withThisOne = familyId
    ? config.familyIds.filter((id) => doneFamilyIds.includes(id) || id === familyId).length
    : done;
  const remainingAfterAdd = Math.max(total - withThisOne, 0);

  return {
    active: active && total > 0,
    done,
    total,
    completesPack: total > 0 && remainingAfterAdd === 0,
    remainingAfterAdd,
  };
}
