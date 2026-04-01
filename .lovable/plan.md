

# Plan: Remove Tabs & Inserts from OrderFiles Page

## Problem

The "Your Document" column on the Upload & Organise Files page (Step 1) currently shows tab dividers and insert sheets alongside actual file sections. These non-file items belong on the Configure Options page (Step 2), not the file management step.

## Changes

### 1. `src/pages/dashboard/OrderFiles.tsx`
- Remove the `TabManager` component and all its related code (tab handler callbacks, `tabInfo` derivation, product options imports)
- Remove `SectionActions` "tab" option from `handleAddAs` — only allow `front_cover`, `back_cover`, `body`, `insert`
- Remove insert from `handleAddAs` as well since inserts are also non-file dividers

### 2. `src/components/order/SectionList.tsx`
- Filter out sections where `section_type` is `"tab"` or `"insert"` so they don't render in the list
- This keeps the "Your Document" column purely file-based (front cover, body, back cover)

### 3. `src/components/order/SectionActions.tsx`
- Remove the "Tab" button from the "Add Selected File As" options (tabs aren't file-backed)
- Confirm whether "Insert" should also be removed (inserts are colored sheets, not uploaded files)

## Scope check needed
Before implementing, I need to verify what SectionActions currently offers.

## Implementation order
1. Filter tabs/inserts out of SectionList rendering
2. Remove TabManager block and related imports/handlers from OrderFiles
3. Clean up SectionActions buttons if needed

