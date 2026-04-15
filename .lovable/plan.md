

## Plan: PostNet Tenant Setup and Branch Self-Service Admin

### Context
The system already has a `branches` table, a `branch_capabilities` table, tenant settings infrastructure, and admin pages for branch management. What's missing is:
- A real PostNet tenant with ~200-300 branches loaded
- A branch-level self-service portal where each branch can toggle which products they offer
- Branch-specific settings (operating hours, contact overrides, etc.)

### Phase 1 — Create PostNet Tenant and Bulk-Load Branches

**Database work:**
- Insert a PostNet tenant record (name: "PostNet", slug: "postnet")
- Create a number sequence for the PostNet app
- You'll provide a CSV/list of PostNet stores (name, code, address, city, province, postal code, phone, email) and I'll bulk-insert them as branches under the PostNet tenant

**No schema changes needed** — the `branches` table already has all the required fields (name, code, address, city, province, postal_code, country, phone, email, is_active).

### Phase 2 — Branch Product Capabilities (Toggle On/Off)

The `branch_capabilities` table already exists with `is_enabled`, `supports_color`, `min/max_pages`, `min/max_quantity`, and `temporary_outage` fields. The plan:

1. **Auto-seed capabilities**: When a new branch is created (or via a bulk action), auto-create one `branch_capabilities` row per active `product_family`, defaulting `is_enabled = true`. This gives every branch a full product matrix out of the box.

2. **Branch Capabilities Admin UI** (on the existing `AdminBranchDetail` Capabilities tab):
   - Replace the read-only table with an interactive toggle grid
   - Each product family gets a row with a Switch to enable/disable
   - Expanding a row reveals fine-tuning: color support, page range, quantity range
   - A "Temporary Outage" toggle with optional "outage until" date (e.g., machine broken for a week)
   - Bulk actions: "Enable All" / "Disable All"

3. **Branch self-service view** (for `branch_manager` / `store_operator` roles):
   - A new route `/admin/branch/products` accessible to branch-level staff
   - Shows only their branch's product toggles — they can enable/disable products and flag outages
   - Cannot change pricing or add new product families (that's head office only)

### Phase 3 — Branch Settings (Self-Service)

Replace the empty `BranchSettings` page with a real settings panel. Settings a branch operator should control:

| Setting | Type | Purpose |
|---------|------|---------|
| Operating hours | JSON (per day) | When the store accepts orders |
| Walk-in enabled | Boolean | Whether walk-in customers are accepted |
| Max daily orders | Number | Capacity throttle |
| Turnaround override | Text | e.g., "Same day" vs tenant default |
| Contact overrides | Text fields | Local phone, email, manager name |
| Delivery radius | Number (km) | For local delivery capability |
| Accepts delivery | Boolean | Whether branch does deliveries |
| Collection available | Boolean | Whether customers can collect |
| Special instructions | Text | Notes for customers (parking, access) |

These will be stored in the existing `branches.settings` JSONB column — no new table needed.

### Phase 4 — Routing and Navigation Updates

- Add `/admin/branch/products` and `/admin/branch/settings` routes for branch-level staff
- Update `AppSidebar` to show "My Products" and "Branch Settings" for `branch_manager` / `store_operator` roles
- Ensure branch staff only see their own branch's data (RLS already handles this via `tenant_id`)

### Technical Details

- **No new tables**: Uses existing `branch_capabilities`, `branches.settings` JSONB, and `tenant_settings`
- **Migration needed**: One migration to auto-seed `branch_capabilities` rows for existing branches (INSERT from cross-join of branches × product_families where no capability row exists yet)
- **New components**: `BranchProductToggles.tsx`, updated `BranchSettings.tsx`
- **Hooks**: `useBranchCapabilities` (CRUD for the toggle grid), extend `useBranches` for settings JSONB
- **RLS**: `branch_capabilities` already has RLS for branch managers and head office admins

### What I Need From You
- The PostNet branch data (CSV or list) with store names, codes, addresses, cities, provinces, postal codes, phone numbers, and emails
- Confirmation on which product families are already seeded (Bound Documents, Flyers, Posters, Presentations, Ring Binders, Brochures?)

