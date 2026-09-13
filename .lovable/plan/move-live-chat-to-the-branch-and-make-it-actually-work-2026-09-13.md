# Move live chat to the branch, and make it actually work

## What's wrong today

Two separate problems, both confirmed:

1. **Live chat is set once per tenant.** The switch and property ID live in Tenant Settings → General, so every branch under a tenant shares one chat inbox. With hundreds of branches that's unusable.
2. **The saved IDs are incomplete, so no widget ever loads.** Tawk needs two path segments (`property/widget`). Both tenants currently have only the first one saved (e.g. `6aa65d504a5102344170244d`), so the chat script is requested from an invalid address and silently fails. The single free-text field invites exactly this mistake.

## What we'll build

**Branch-level live chat**
- New "Live chat" section in Branch Settings → Operations: an on/off switch, a **Property ID** field and a **Widget ID** field (two fields instead of one, so the format can't be entered wrong), plus a short "where to find these" note and a paste-the-whole-link helper that splits a pasted Direct Chat Link into the two fields automatically.
- Saved against the branch, using the same branch-settings mechanism already used for tax, regional and weight settings — so it works for anonymous shoppers too.

**Tenant stays as a fallback**
- Tenant Settings keeps its live chat section, relabelled as the default used by branches that haven't set up their own. It gets the same two-field treatment, and the existing single-value entries are read as the property ID.
- Resolution order on the customer portal: branch setting → tenant default → (demo tenants only) the platform widget.

**Correct wiring on the storefront**
- The customer portal picks up the chat settings of the **currently selected branch**, and swaps the widget when the shopper changes branch.
- If either ID is missing or the pair looks malformed, no script is injected and the admin screen shows an inline warning rather than failing silently.
- Admin, platform and branch back-office screens stay chat-free, as now.

**Fix the existing data**
- The 2027 Edition and the demo tenant both have half an ID saved. Their switches stay on but chat will keep failing until the widget ID is supplied — the settings screen will flag this clearly so you can paste the full link.

## Verification

Load the 2027 Edition storefront with a branch that has chat configured and confirm the Tawk bubble appears and loads; switch branch and confirm the widget swaps; check a branch with no chat configured falls back to the tenant default; confirm no chat script loads on login, admin, platform or branch pages.

## Technical notes

- Store under `branch_settings` category `integrations`, keys `tawk_enabled`, `tawk_property_id`, `tawk_widget_id`; read via the existing `resolve_branch_setting(p_branch_id, p_category, p_key)` RPC, which already cascades branch → tenant.
- New hook `src/hooks/useLiveChatSettings.ts` returning `{ enabled, propertyId, widgetId, src }`.
- `TenantChatWidget.tsx` becomes `LiveChatWidget.tsx`: takes a resolved `src`, re-injects on change, keeps the existing cleanup.
- `CustomerLayout.tsx` (both mobile and desktop branches) consumes the hook keyed on the active branch from `BranchContext`; remove the direct `useTenantSettingsMap("integrations")` tawk reads.
- Admin UI: new card in `BranchSettings.tsx` Operations tab; update the existing card in `admin/settings/GeneralTab.tsx`.
- No schema migration needed — `branch_settings` already exists.
