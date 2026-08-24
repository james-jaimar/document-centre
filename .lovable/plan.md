# Lock document size when tab dividers are selected

Pre-made tab banks are a physical product at one fixed sheet size (A4 in metric, Letter in imperial). Today a customer can pick "10 Tabs" and then switch the document to A5 or A3 Landscape, which cannot be produced. This locks the size while tabs are in play.

## Behaviour

1. When the selected tab option is a real tab bank (not "None"), the **Document Size** selector becomes a locked, read-only row showing the tab-compatible size, with helper text: "Locked to A4 — pre-made tab dividers are only available at A4. Remove tabs to change the size."
2. If the customer already had a non-compatible size selected and then chooses tabs, the size is switched to the compatible one automatically and a toast explains why.
3. Unselecting tabs ("None") unlocks the selector immediately and leaves the current size in place.
4. Same rule applies to every family that offers tabs — Bound Documents, Presentations, Ring Binders — because it is driven by the tab option itself, not by the family slug.

## Which size counts as compatible

Driven by the tab option value's metadata so it stays admin-configurable and unit-aware:

- `metadata.sheet_size` on the tab value (e.g. `"A4"` / `"Letter"`) is used when present.
- Otherwise it falls back to the branch measurement system: A4 for metric, Letter for imperial.
- If the family's Document Size list contains no matching value (portrait or landscape twin), the lock is skipped and instead a warning is shown under the tab selector so nothing gets silently blocked.

Portrait is treated as the compatible orientation; A4 Landscape is not offered while tabs are on, since the tab protrusion sits on the long edge of a portrait sheet.

## Technical notes

- `OptionsPanel` already supports a `lockedDisplay` prop (used by Business Cards). Reuse it: `OrderBuild` computes a `lockedDisplay` entry for the Document Size option whenever `tabInfo` is non-null.
- `tabInfo` (OrderBuild, ~line 1343) already resolves the selected tab value and its metadata — extend the returned object with the resolved `sheetSize`.
- A small effect coerces `spec.selected_options["Document Size"]` to the compatible slug when tabs turn on, matching by the size option's `metadata.iso` / slug, and fires a single toast.
- No pricing, section or preview logic changes; the size value written to the spec is one that already exists in the family's catalogue-backed size list.
