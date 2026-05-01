## Subscription Management Rework

The current flow has platform admins triggering Stripe checkout sessions on behalf of tenants. That's backwards. The correct flow is:

1. **Platform admin assigns a plan** to a tenant (region + plan + optional discount/trial/freebie)
2. **Tenant owner logs in**, sees the assigned plan on their Billing tab, and pays via Stripe checkout from there
3. Platform admin has full control: discounts, free trials, promo codes, manual overrides

This touches the database schema, both Edge Functions, the platform admin UI, and the tenant Billing tab.

---

### Phase 1 -- Database: Promo Codes and Subscription Enhancements

**New table: `platform_promo_codes`**
- `code` (unique text), `description`, `discount_type` (percentage / fixed_amount / free_months), `discount_value` (numeric), `currency_code` (for fixed amounts), `max_uses`, `times_used`, `valid_from`, `valid_until`, `applicable_plan_slugs` (text array -- null = all plans), `is_active`, timestamps

**Extend `tenant_subscriptions`**
- `region_id` (uuid, FK to pricing regions) -- which pricing region was assigned
- `assigned_plan_slug` -- what the platform admin assigned (may differ from active `plan_slug` before payment)
- `promo_code_id` (uuid, FK) -- applied promo code
- `discount_type`, `discount_value` -- snapshot of discount at assignment time
- `assigned_at` -- when the admin assigned this plan
- `assigned_by` -- profile_id of the assigning admin
- `billing_status` -- `pending_payment` | `paid` | `free` | `manual` (replaces the confusing "incomplete" status for admin-assigned plans)

**RLS**: Platform admins full access on promo codes. Tenant admins can read promo codes (to validate codes entered by tenants).

---

### Phase 2 -- Platform Admin: Subscription Dialog Rework

Replace the current "Start Checkout" modal on both Tenant Management and Subscriptions pages with an **"Assign Subscription"** dialog:

- **Region** dropdown (auto-selects default)
- **Plan** dropdown (Starter / Core / Multi-Branch with prices in that region's currency)
- **Discount** section:
  - Toggle: "Apply discount"
  - Options: Promo code lookup, or manual discount (percentage / fixed amount / free months)
  - Shows calculated final price
- **Trial** toggle: offer N days free trial
- **Freebie** toggle: mark subscription as free (no payment required)
- **Assign** button -- writes the subscription record with `billing_status = 'pending_payment'` (or `'free'` for freebies)

The Subscriptions table will show the billing_status column so admins can see who's pending payment vs paid vs free.

---

### Phase 3 -- Platform Admin: Promo Codes Management

New section on the Subscriptions page (or a sub-tab):
- CRUD for promo codes
- Table showing: code, description, discount type/value, usage count, validity dates, status
- Create dialog with all the fields above

---

### Phase 4 -- Tenant Billing Tab Rework

The tenant's Billing tab currently lets them pick any plan and checkout. Rework it:

- **If a plan has been assigned by admin** (`billing_status = 'pending_payment'`):
  - Show a prominent notification: "Your [Plan Name] subscription has been set up. Complete payment to activate."
  - Show the assigned plan, region, price, any discount applied
  - Single "Pay Now" button that triggers Stripe checkout with the correct price (and Stripe coupon if discount was applied)
- **If subscription is active** (`billing_status = 'paid'` or `'free'`):
  - Show current plan details, period dates, payment status
  - Option to manage payment method (Stripe Customer Portal link)
- **If no subscription assigned**:
  - Show "Contact your administrator to set up a subscription" (tenants don't self-serve plan selection -- the admin assigns it)

---

### Phase 5 -- Edge Function Updates

**`create-checkout`**: Add support for Stripe coupons. When the subscription record has a discount, create a Stripe coupon/promotion and attach it to the checkout session.

**`stripe-webhook`**: Update `billing_status` to `'paid'` on successful payment. Handle trial-related events.

---

### What this achieves

- Platform admin is in full control of who gets what plan, at what price, with what discounts
- Tenants only see what they've been assigned and pay for it
- Promo codes can be created for marketing campaigns
- Free/manual subscriptions are properly tracked
- Clean separation: admin assigns, tenant pays

---

### Technical details

- 1 new table (`platform_promo_codes`)
- 4-5 new columns on `tenant_subscriptions`
- Rewrite of `TenantSubscriptionDialog.tsx` (assign flow instead of checkout)
- Rewrite of `BillingTab.tsx` (payment-focused instead of plan-selection)
- Updates to both Edge Functions for coupon/discount support
- New promo codes CRUD UI on the Subscriptions page
