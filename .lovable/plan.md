## Fix: Branch Settings blank page — Radix Select empty-value crash

### Root cause (confirmed)

`src/components/branch/BranchInvoiceNumberingCard.tsx` renders a Radix `<Select>` for the invoice number format, with `FORMAT_PRESETS[0].value = ""` as the "Inherit from tenant" option. Radix `Select.Item` throws when `value=""` — that's exactly the console error in the screenshot:

> A <Select.Item /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder.

Because the throw happens during render of the settings page, the whole route unmounts to a blank page.

### Fix

In `src/components/branch/BranchInvoiceNumberingCard.tsx`:

1. Introduce a sentinel `const INHERIT = "__inherit__"` and use it as the value of the "Inherit from tenant" `SelectItem` (instead of `""`).
2. Map on read: when loading `data.branch.invoice_number_format`, if unset use `INHERIT` for the form state (so the select shows the inherit row) instead of `""`.
3. Map on save: when `form.format === INHERIT`, push `"invoice_number_format"` into the `deletes` array (current behaviour for `""`); otherwise upsert the template string as today.
4. Update the preview `useMemo` to treat `INHERIT` the same as "no override" (fall back to `tenantFormat`).

No schema, RPC, or other component changes required. Everything else in the card (prefix / suffix / starting number / save flow) stays as-is.

### Verification

- Reload `/branch/settings` — page renders, no Radix throw in console.
- Selecting "Inherit from tenant" then Save deletes the branch `invoice_number_format` row.
- Selecting a preset then Save upserts the template string.
- Preview line updates correctly for both cases.
