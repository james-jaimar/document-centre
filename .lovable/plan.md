
## Problem

When uploading multiple files (e.g., an A4 PDF then a Letter-size Word doc), the PaperSizeAdvisory dialog appears for the non-ISO file, but if the user tabs away and returns, the dialog auto-dismisses and the size mismatch is silently resolved without user input.

**Root cause (two-part):**

1. **Radix Dialog dismissal on tab switch**: The `PaperSizeAdvisory` dialog uses a plain `onOpenChange` handler that clears `advisoryDoc` whenever the dialog closes — including when Radix fires `onOpenChange(false)` due to focus loss on tab switch. The document's `preflight_data` is NOT updated (no `size_resolved` flag), so the doc remains unresolved.

2. **Silent auto-apply on re-detection**: When the user returns and the advisory useEffect re-fires, if `sessionSizeLock` was set by the first (ISO) upload, the unresolved Letter-size doc hits the `if (sessionSizeLock)` branch (line 628) and is silently auto-applied — the user never gets to review it.

## Fix

### 1. Prevent advisory dialogs from dismissing on background/blur

In `OrderFiles.tsx`, update the `PaperSizeAdvisory`, `BleedAdvisory`, and `OrientationAdvisory` dialog wrappers to block dismissal when the dialog is still relevant:

- Add `onPointerDownOutside={(e) => e.preventDefault()}` and `onInteractOutside={(e) => e.preventDefault()}` to prevent Radix auto-close behaviour.
- Change `onOpenChange` to only allow closing via the explicit action buttons (Keep Original / Scale To), not via the backdrop or focus loss.

Alternatively, since the Dialog component is controlled (`open={!!advisoryDoc}`), simply ignore `onOpenChange(false)` — only clear `advisoryDoc` from the explicit button handlers:

```tsx
onOpenChange={() => {}} // Do nothing — only buttons can dismiss
```

### 2. Apply the same protection to BleedAdvisory and OrientationAdvisory

Same pattern — these dialogs should not auto-dismiss on tab switch either.

### 3. Protect UploadProgressModal (already partially handled)

The `UploadProgressModal` already prevents outside-click during active uploads but allows it after completion. This is acceptable since it has the explicit "Continue" button flow. No change needed here.

## Technical Details

**Files to modify:**
- `src/pages/dashboard/OrderFiles.tsx` — change `onOpenChange` for PaperSizeAdvisory, BleedAdvisory, and OrientationAdvisory to no-op (preventing Radix-driven dismissal)
- `src/components/order/PaperSizeAdvisory.tsx` — add `onPointerDownOutside` / `onEscapeKeyDown` prevention on DialogContent
- `src/components/order/BleedAdvisory.tsx` — same treatment
- `src/components/order/OrientationAdvisory.tsx` — same treatment

The key principle: these advisory dialogs require an explicit user decision. They should never be dismissible by clicking outside, pressing Escape, or losing focus.
