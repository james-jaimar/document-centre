Make the `CustomerAddressDialog` scrollable and viewport-bounded so it no longer overflows the top/bottom of the screen.

## Change

In `src/components/admin/CustomerAddressDialog.tsx`, update the `<DialogContent>` wrapper:

- Cap height to viewport: add `max-h-[90vh]` and `flex flex-col`.
- Wrap the form body grid in a scrollable container: `flex-1 overflow-y-auto pr-1 -mr-1` so the long form scrolls inside while the header and footer stay pinned.
- Keep header and footer outside the scroll area.

No logic, fields, or styling tokens change — only layout/responsiveness on the dialog shell. This fixes the modal both in the customer "My Account" view (where it's reused via `AddressPicker` / direct usage) and in admin contexts.
