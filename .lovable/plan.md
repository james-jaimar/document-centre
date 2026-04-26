# Hide binding options without artwork

The user asked to hide **Spiral Blue, Comb White, Comb Navy** until artwork is supplied. While planning I noticed **Twin Loop Wire (White)** is in the same situation (it's seeded but has no PNG and currently falls back to wire-black art). I'll flag it but only remove it if you confirm — for now the plan removes the three you named.

## What "hide" means here

Binding options live in two places:

1. **Seed file** `src/lib/productOptionValues.ts` — source of truth for any future tenant/product seeding.
2. **Live database** `product_options.values` JSONB array — what the configurator actually reads. Two rows currently carry the Binding list (one per seeded product/tenant).

Both need updating, otherwise live products keep showing the unsupported options to customers.

## Changes

### 1. Update the seed file
`src/lib/productOptionValues.ts` — remove these three entries from `BINDING_STANDARD`:
- `Spiral Binding (Blue)`
- `Comb Binding (White)`
- `Comb Binding (Navy)`

### 2. DB migration to strip them from live `product_options`
Idempotent migration that filters the three labels out of every `product_options.values` array where the option is named `Binding`:

```sql
UPDATE product_options
SET values = (
  SELECT jsonb_agg(v)
  FROM jsonb_array_elements(values) v
  WHERE v->>'label' NOT IN (
    'Spiral Binding (Blue)',
    'Comb Binding (White)',
    'Comb Binding (Navy)'
  )
)
WHERE name ILIKE 'Binding';
```

Two rows match (verified via `supabase--read_query`). Other options are untouched.

### 3. Tidy `bindingAssets.ts` comments
Drop the now-stale "Spiral Blue / Comb White / Comb Navy fall back to black" comments so future devs aren't told to expect art for options that no longer exist. The fallback ladder itself stays (defensive, harmless).

## Not included (flagging for confirmation)

- **Twin Loop Wire (White)** — also has no dedicated artwork; currently falls back to wire-black. If you'd like it hidden too, say the word and I'll fold it into the same migration + seed edit.
- **Existing orders / cart items** that already chose one of the removed options aren't touched — they keep their saved selection (and render via the existing fallback art) so historical orders stay intact. Only **new** configurations are affected.

## Verification after apply

- Re-query `product_options.values` to confirm the three labels are gone from both rows.
- Open the bound-document configurator and confirm the Binding selector shows: Spiral (Black/White/Clear), Comb (Black), Twin Loop (Black/Silver/White), plus Ring Binders.
- Smoke-test Spiral Black + landscape A4 still resolves the 210mm short-edge art (resolver untouched).