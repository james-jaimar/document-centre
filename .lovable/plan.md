## Goal

Drop the password from the demo gate on all tenant storefronts (PostNet, 3@1, Jetline, etc.). Visitors instead see a modal they cannot dismiss, with the same headline and disclaimer copy, one checkbox ("I understand this is a concept demonstration and not a live commercial service") and an "Enter demo" button.

## What changes

**1. New modal component (`src/components/legal/DemoGateModal.tsx`)**
- Replaces `DemoGatePage.tsx` (page version removed).
- Radix `Dialog` with `open` forced true: no close button, `onPointerDownOutside`/`onEscapeKeyDown` prevented, `onInteractOutside` prevented — no way past it except accepting.
- Same content: headline, tenant name line, rendered `disclaimer_html`, checkbox, primary button (disabled until checked).
- No password field, no edge-function call. Accepting writes the unlock locally.

**2. Guard (`src/components/legal/DemoGateGuard.tsx`)**
- Still resolves tenant + config + unlock state exactly as now, and keeps all bypasses (platform admin, tenant staff, already unlocked).
- When gated, it now renders `{children}` **plus** the modal on top, so the storefront is visible behind the overlay rather than replaced by a full page.
- Loading/error states stay as-is.

**3. Unlock without a server round-trip (`src/hooks/useDemoGate.ts`)**
- `unlock()` computes `expires_at = Date.now() + cookie_days * 86400000` client-side and stores it in localStorage under the existing `dc_demo_unlock_<tenantId>` key, so already-unlocked visitors are unaffected.
- The `demo-gate-unlock` edge function is no longer called from the client. It can stay deployed harmlessly, or be deleted — I'll leave it in place unless you prefer removal.

**4. Admin card (`src/pages/admin/settings/DemoModeCard.tsx`)**
- Remove the "Access password" block and the "set a password before enabling" validation, so tenants can be gated with just the disclaimer.
- Reword the helper copy: visitors see an acknowledgement modal, not a password screen.
- Keep headline, disclaimer rich text, remember-for-days, and the enable switch.

## Notes

- No database change required: `password_hash` simply stops being read. `resolve_demo_gate` already returns the fields the modal needs.
- This applies automatically to every tenant with demo mode enabled — nothing per-tenant to reconfigure.
- Anyone who previously unlocked with a password stays unlocked (same storage key and format).
