I found the likely failure point: the customer hook now respects `source`, but when admin switches an option from catalogue back to manual, the saved manual `values` are still the catalogue mirror rows. That means the customer is correctly reading `product_options`, but `product_options.values` itself has been overwritten by the catalogue list.

Plan:

1. Preserve separate manual values in the admin editor
- Add local tracking in `ProductOptionsEditor` for the last known manual value list while editing.
- When Source changes to `manual`, restore those manual values instead of leaving the current catalogue mirror in `editValues`.
- When Source changes to `catalog.*`, build the catalogue mirror for display/toggles, but do not destroy the remembered manual list in the dialog.

2. Make catalogue save explicit and source-driven
- On save:
  - `source = manual` saves the manual values only.
  - `source = catalog.finishing` saves the catalogue mirror rows for the selected category only.
  - No name-based or stale mirror data should be saved when manual is selected.

3. Keep preview metadata wired for catalogue rows
- Reuse the existing cover/binding preview metadata mapper for admin-built catalogue mirrors too, not only the customer-side enrichment.
- This ensures saved catalogue rows contain `front`, `back`, `binding_method`, `size_mm`, etc. directly in `product_options.values`.

4. Add a data repair migration for the current broken Bound Documents Covers row
- Current DB state shows Bound Documents → Covers is `source: manual`, but its values are catalogue rows (`acetate-cover`, `frosted-pvc-cover`, etc.).
- Restore the manual Bound Documents cover options to the seeded manual set (`No Cover`, clear/matte/frosted front + card backs, white card, printed covers) so manual mode actually has manual values again.

5. Customer configurator remains strictly product-option driven
- Keep `useCatalogBackedOptions` behaviour:
  - manual: read saved `product_options.values` exactly
  - catalogue: enrich saved product catalogue rows using the master catalogue
- Make any small fixes needed so disabled catalogue values are filtered according to product options, not master catalogue defaults.

6. Verify
- Query Supabase after changes to confirm Bound Documents Covers manual values are restored.
- Confirm toggling source in admin saves `source` and `values` consistently.
- Confirm customer view changes based on the saved product option source and selecting Frosted changes preview metadata.