
## Tawk.to Chat Widget Scoping

### Problem
The platform's Tawk.to widget currently loads on all tenant portals. It should only appear on the main marketing site and the demo tenant. Real tenants should be able to configure their own Tawk.to widget.

### Changes

#### 1. Remove ChatWidget from CustomerLayout
**File: `src/components/CustomerLayout.tsx`**
- Remove the `<ChatWidget />` import and rendering.
- Replace with a new `<TenantChatWidget />` component that conditionally loads based on tenant settings.

#### 2. New TenantChatWidget component
**File: `src/components/TenantChatWidget.tsx`**
- Accepts tenant branding/settings data.
- If the tenant `is_demo` is true, load the platform's Tawk.to script (hardcoded platform property ID).
- Otherwise, check `tenant_settings` for `integrations` category with keys `tawk_enabled` (boolean) and `tawk_property_id` (string like `XXXXXXX/YYYYYYY`).
- If enabled and a property ID is set, inject the tenant's own Tawk.to embed script.
- Uses a unique script per tenant property ID; cleans up on unmount/tenant change.

#### 3. Marketing pages keep the existing ChatWidget
**Files: `MarketingLanding.tsx`, `Contact.tsx`, `Pricing.tsx`**
- No changes. These already use the platform `ChatWidget` with the hardcoded property ID.

#### 4. Admin Settings -- Integrations section in GeneralTab (or new tab)
**File: `src/pages/admin/settings/GeneralTab.tsx`**
- Add a "Live Chat" card with:
  - Toggle: "Enable Tawk.to live chat" (saves `integrations.tawk_enabled`)
  - Text input: "Tawk.to Property ID" (format: `propertyId/widgetId`, saves `integrations.tawk_property_id`)
  - Help text explaining where to find their property ID in Tawk.to dashboard.
- Uses the existing `useBulkUpsertTenantSettings` pattern with category `integrations`.

#### 5. Load tenant chat settings in CustomerLayout
**File: `src/components/CustomerLayout.tsx`**
- Pass `tenant.is_demo` and the integrations settings to `TenantChatWidget`.
- Use `useTenantSettingsMap("integrations")` to fetch `tawk_enabled` and `tawk_property_id`.

### No database migration needed
Settings are stored via the existing `tenant_settings` table (category=`integrations`, keys=`tawk_enabled` / `tawk_property_id`).
