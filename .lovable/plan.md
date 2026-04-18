

The screenshot shows 154 errors in the console. From the console log excerpt I can see two clear React warnings being thrown repeatedly:

1. **`MembersTable` ref warning** — "Function components cannot be given refs. Did you mean to use React.forwardRef()?" thrown from `AdminUsers` rendering `MembersTable`. The `AdminUsers` page is likely passing a `ref` to `MembersTable` (a plain function component).

2. **`DropdownMenu` ref warning** — "Function components cannot be given refs" thrown from `MembersTable` rendering a `DropdownMenu`. Inside the row actions, a `DropdownMenuTrigger asChild` is wrapping a custom function component (likely the icon button) instead of a forwardRef'd element.

Both warnings fire on every render and every row, which compounds into hundreds of console errors as the table re-renders. Let me check the actual files to confirm.

I'll read `AdminUsers.tsx` and `MembersTable.tsx` to identify the exact ref-passing sites, then fix both. I also need to check whether anything else is contributing — but the stack traces in the console point squarely at these two.

### Fix

**`src/components/admin/MembersTable.tsx`**
- Convert the component (or whichever inner button/icon component is used as `DropdownMenuTrigger asChild`) to use `React.forwardRef` so Radix can attach its ref. Most common cause: a wrapper like `<IconButton>` or a custom action component used as `asChild`. Replace with the standard `<Button>` from `@/components/ui/button` (which already forwards refs) or wrap in `forwardRef`.
- Also: if `AdminUsers` is passing a `ref` prop to `<MembersTable ref={...}>`, either drop it or wrap `MembersTable` in `forwardRef`.

**`src/pages/admin/AdminUsers.tsx`**
- Remove any stray `ref={...}` being forwarded to `MembersTable`. (Possible leftover from a refactor.)

### Files touched
- `src/components/admin/MembersTable.tsx`
- `src/pages/admin/AdminUsers.tsx`

No schema, edge function, or data changes — pure client-side cleanup. After the fix, the console should drop from ~154 errors to near zero (auth/network warnings aside).

