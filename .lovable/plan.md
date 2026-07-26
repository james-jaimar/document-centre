## What's actually happening

The toast `operator does not exist: catalog_kind = text` is **not** an RLS problem, not an impersonation problem, and not a "layers of complexity" problem. It is a single-line bug in one database trigger function that I introduced when we added the "delete master catalogue rows also cleans up product_catalog_links" behaviour.

The function `public.cleanup_product_catalog_links_on_catalog_delete` runs on `BEFORE DELETE` on `catalog_finishing` / `catalog_papers` / `catalog_sizes` / `catalog_print_attrs`. Inside it, `_catalog` is declared as `text`, but `product_catalog_links.catalog` is the enum `catalog_kind`. So this line:

```sql
DELETE FROM public.product_catalog_links
 WHERE catalog = _catalog       -- catalog_kind = text  → no such operator
```

aborts the whole DELETE with the exact error you saw. Because it's a `BEFORE DELETE` trigger, the parent delete never happens — and because the earlier hook change now surfaces errors, the toast finally shows up. Same root cause was silently blocking Foil Stamping / Embossing before.

Nothing else is wrong here — the RLS policies on `catalog_finishing` are correct, you *are* platform_admin, and the impersonation cleanup from the previous turn is fine and can stay.

## The fix (one migration)

Replace the trigger function so `_catalog` is the enum type:

```sql
CREATE OR REPLACE FUNCTION public.cleanup_product_catalog_links_on_catalog_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _catalog public.catalog_kind;
BEGIN
  _catalog := CASE TG_TABLE_NAME
    WHEN 'catalog_sizes'       THEN 'size'::public.catalog_kind
    WHEN 'catalog_papers'      THEN 'paper'::public.catalog_kind
    WHEN 'catalog_finishing'   THEN 'finishing'::public.catalog_kind
    WHEN 'catalog_print_attrs' THEN 'print_attr'::public.catalog_kind
  END;

  IF _catalog IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.product_catalog_links
   WHERE catalog = _catalog
     AND lower(item_code) = lower(OLD.code);

  RETURN OLD;
END;
$$;
```

That's the whole change. No schema changes, no RLS changes, no code changes.

## Verification

1. In `/platform/catalog`, delete a master-scope Foil Stamping / Embossing row — expect success (row disappears, no toast).
2. Re-run for a row that has a linked product → confirm both the catalog row and the `product_catalog_links` rows for it are gone.
3. Repeat once for `catalog_sizes`, `catalog_papers`, `catalog_print_attrs` to confirm all four table triggers work.

## Not doing (deliberately)

- Not touching RLS on `catalog_*`.
- Not touching the impersonation isolation logic added last turn — it's correct and unrelated.
- Not "simplifying layers" broadly; the actual cause is one function. If after this fix you still feel the catalogue area is over-complex, tell me which surface feels wrong and I'll scope a separate cleanup plan.
