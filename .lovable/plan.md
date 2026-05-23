## Problem

The "Edit Option" modal for Tab Dividers (and any option with many fields) overflows horizontally. The label `Input` is squeezed so badly that only ~5 characters show ("Tab Divid…"), and the whole row triggers a horizontal scrollbar at the dialog level. Root cause: the dialog is capped at `sm:max-w-2xl` (672px), while each `ValueEditorRow` packs 8 fixed-width controls onto a single inline flex line.

## Fix (UI-only, `src/components/admin/ProductOptionsEditor.tsx`)

1. **Widen + harden the dialog**
   - Change `DialogContent` className from `sm:max-w-2xl max-h-[85vh] overflow-y-auto` to `max-w-[min(1100px,95vw)] max-h-[90vh] overflow-y-auto overflow-x-hidden`.
   - Bump the values scroll area from `max-h-[40vh]` to `max-h-[55vh]`.

2. **Responsive `ValueEditorRow` layout**
   - Replace the single `flex items-center gap-2` with a 12-column grid that wraps on narrow widths:
     - Label: spans wide (e.g. `col-span-12 md:col-span-4`), so "Tab Dividers — Pack of 14" is fully readable.
     - Group: `md:col-span-2`.
     - Price + price-type: `md:col-span-3` (sub-grid).
     - On / Default switches: `md:col-span-2`.
     - Expand + delete buttons: `md:col-span-1` right-aligned.
   - Remove the fixed `w-24 / w-32 / w-20` widths; use `w-full` inside each cell so the label and selects grow with the dialog.
   - Keep the "Hidden" badge but move it next to the label so it doesn't push controls off-screen.

3. **Prevent any future overflow**
   - Add `min-w-0` to flex/grid children that contain inputs (standard fix for Input + truncate inside flex).
   - Ensure the outer dialog body uses `min-w-0` so the inner grid actually shrinks instead of forcing horizontal scroll.

No behavioural changes, no schema changes, no consumer-side changes — purely layout/responsiveness inside the editor modal.
