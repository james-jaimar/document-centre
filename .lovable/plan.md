# Pricing flow audit — branch wins?

## What I checked

There are only two customer-facing pricing entry points in the app. Both feed into the same `calculatePriceFromRateCard` engine.

| Builder | File | Hooks used | Branch arg |
|---|---|---|---|
| All print products (Flyers, Posters, Brochures, Bound docs, Business Cards click charges, etc.) | `src/pages/dashboard/OrderBuild.tsx` | `useResolvedRateCardClicks / Papers / Finishing / PhotoPrints / BusinessCards / PriceBreaksBundle` | `effectiveBranchId = activeBranch?.id ?? membershipBranchId` |
| Photo Prints | `src/pages/dashboard/PhotoPrintsBuilder.tsx` | `useResolvedRateCardPhotoPrints / PriceBreaksBundle` | `activeBranch?.id` |

Both pass `{ tenantId, branchId }` into the **resolved** hooks in `src/hooks/useResolvedRateCard.ts`.

## How the resolver guarantees branch wins

`useResolvedRateCard.ts` fetches master + tenant + branch rows in parallel and merges them with `mergeByKey`, which inserts in **master → tenant → branch** order. `Map.set` on the same natural key overwrites the previous entry, so the **branch row always wins** when present. Inactive branch rows also win (explicit suppression).

Natural keys per table:
- `rate_card_clicks` → `SIZE|colour|sides`
- `catalog_papers` (resolved) → `code-size`
- `catalog_finishing` (resolved) → `code|variant|size`
- `rate_card_photo_prints` → `code`
- `rate_card_business_cards` → `code|qty|sides|paper|finish`
- `rate_card_price_breaks` → not merged (tier rows referenced by parent `rate_card_id`; engine looks up by parent scope already).

`staleTime: 0` + `refetchOnWindowFocus: true` is set on clicks, so a fresh branch edit is reflected immediately on tab focus.

## Walkthrough per product family

All families resolve through `OrderBuild.tsx` → `calculatePriceFromRateCard`, so the same merge applies to:

1. **Flyers / Posters / Loose Sheets** — paper + click + finishing → branch wins.
2. **Brochures** — same as flyers; brochure-specific finishing keyed on size/variant → branch wins.
3. **Bound documents (Comb, Wire, Spiral, Saddle, Perfect, Hard cover)** — body papers, cover papers, click charges (incl. A0/A1/A2 now backfilled into Sandton), binding finishing → branch wins.
4. **Tabs / Inserts** — priced via finishing catalogue items → branch wins.
5. **Business Cards** — `useResolvedRateCardBusinessCards` → branch wins.
6. **Photo Prints** — separate builder, same resolver pattern → branch wins.
7. **Click-charge ladders / price breaks** — bundle hook returns master + tenant + branch tiers; engine resolves the ladder attached to whichever parent `rate_card_id` was selected, so when a branch overrides a clicks row, its ladder applies; otherwise the tenant or master ladder applies.

## Risk areas to spot-check (no code change)

I'd like to run the following read-only DB spot checks before declaring it green for every PostNet branch, and report the results back:

1. For each tenant, count `rate_card_clicks` rows at tenant scope vs the union of distinct `(size,colour,sides)` keys per branch — flag any branch missing keys the tenant has (these are the ones the backfill should already have covered, but verifying explicitly).
2. Same for `catalog_paper_prices`, `catalog_finishing_prices`, `rate_card_photo_prints`, `rate_card_business_cards` per branch.
3. Spot-check one live order on Sandton City for an A1 colour click and confirm the per-unit price equals the branch row, not the tenant row.

## Deliverable

A short written report (in chat) with:
- ✅/❌ per product family confirming branch precedence.
- Table of any branches still missing rows after the backfill (per rate-card table), with the SQL to top them up.
- Sandton spot-check result.

No code changes proposed — this is a verification pass. If gaps are found I'll come back with a follow-up plan.
