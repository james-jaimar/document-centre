# Paste a column of prices into the pack pricing grid

Yes — this is very doable. Copy a column from Excel/Sheets, click the first cell in a column, paste, and each pasted line fills the next row down.

## Behaviour

- Paste into any numeric cell (Qty, Consumer, Trade, Cost, Weight kg) in a sides column.
- One value per line fills that column downwards from the cell you pasted into.
- Tab-separated values (a copied block of several columns) also fill sideways: line 1 fills the pasted row across Consumer/Trade/Cost/etc., line 2 the row below, and so on.
- Values are cleaned as they land: currency symbols, thousands separators, spaces and trailing blanks are stripped, so `R 1 750,00` and `1750.00` both work.
- Blank cells in the paste leave the existing value untouched.
- If the paste is longer than the number of rows in that column, the extra values are ignored and a toast says how many were skipped, so you can add the missing qty tiers first. (Alternative available on request: auto-create the extra rows.)
- Single-value pastes behave exactly as they do today.

## Where it applies

Applies to the shared pack pricing grid, so it works in Master, Tenant and Branch pack pricing (they all render the same editor). The same helper is written to be reusable, so we can drop it into the rate card and variant pricing grids afterwards if you want.

## Technical notes

- New helper `src/lib/pricing/gridPaste.ts`: parses clipboard text into a 2D array of trimmed strings and exposes a `parseNumericCell` for currency cleanup.
- New hook `src/hooks/useGridPaste.ts` returning an `onPaste` handler factory keyed by `(rowIndex, columnKey)`.
- `src/components/pricing/PackPricingMatrixEditor.tsx`: the `SidesColumn` row inputs get `onPaste`; each column maps to the correct field/scale (`price_minor`/`trade_price_minor`/`cost_minor` × 100, `weight_grams` × 1000, `qty` integer). Updates are applied as a single batched set of `onUpdateBlock` calls so the ladder does not re-render per value.
- No database or pricing-logic changes; this is purely an editor input convenience.
