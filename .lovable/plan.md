# Remove imperial papers from the Metric product view

## What is confirmed

- The Metric/Imperial selector and catalogue query are filtering correctly: the editor passes `unitSystem = 'metric'`, and `useCatalogPapers` applies `unit_system = 'metric'`.
- The problem is in the live master catalogue data. The metric catalogue has 42 active paper rows, including 15 US-only rows such as `80lb Cover`, `100lb Gloss Cover`, `110lb Index`, and `14pt C2S`, all incorrectly tagged `unit_system = 'metric'`.
- Those rows were present when the catalogue split was introduced and were treated as metric source rows, so imperial mirror rows were also generated for them. This created duplicate imperial definitions as well as the incorrect Metric list seen in the screenshot.
- No product catalogue links or master paper-price rows currently reference those 15 `us-*` paper codes, so the cleanup can be done without remapping dependent records.

## Fix

1. **Clean the master paper data**
   - Consolidate each affected US stock onto one canonical imperial row.
   - Remove the generated duplicate mirror rows for those US-only stocks.
   - Remove the 15 US-only definitions from the metric catalogue by moving/merging them into the imperial catalogue rather than losing the valid US stock choices.
   - Preserve the genuine metric-to-imperial twin pairs already used for standard papers.

2. **Add a catalogue integrity guard**
   - Prevent an obviously US-only paper definition (`region = US` / US-specific code) from being saved into the metric catalogue again.
   - Keep the existing unit filter as the single UI path; no product-family duplication is required.

3. **Verify end to end**
   - Confirm the Metric Paper Stock dialog contains only metric-labelled stocks and no `lb`/`pt` US rows.
   - Confirm the Imperial dialog contains one copy of each intended US stock, with no generated duplicates.
   - Check product option mirrors and branch/customer resolution for both a metric and imperial branch.
   - Run the relevant catalogue and option-adapter tests.

## Technical details

- Use a data operation for the existing-row cleanup, not a schema migration.
- Add a focused validation in the master paper catalogue save path so future edits cannot recreate the bad unit assignment.
- Re-query counts and duplicate labels/codes after cleanup before considering the issue resolved.
