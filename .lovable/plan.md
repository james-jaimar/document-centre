
## 1. Default sender email for new branches

Today new branches inherit `hello@document-centre.com` as the sender. Change so a new branch has **no** sender email until the manager configures one.

- Stop seeding a default `from_email` on branch creation (check `provision-branch-admins`, `create-branch`, and any `email_accounts` seed).
- Branch Settings → Email tab: if no active `email_accounts` row for the branch, show a prominent amber warning banner: "No sender email configured — customer emails, quotes and invoices will not send until you set this up." with a CTA button to add one.
- Order/quote/invoice send code: when branch has no sender email, block the send and surface a clear error to the user instead of silently falling back.

## 2. Onboarding helper must be dynamic

The "Get your branch ready" checklist currently shows static state. Wire each step to a real check via `recompute_branch_onboarding` and add checks that are missing:

| Step | Signal |
|---|---|
| Confirm company details | `branch_settings.trading_name/address/phone` populated |
| Add banking details | `branch_private.bank_*` populated |
| Review your prices | `branches.pricing_reviewed_at` set (mark on first save in Pricing) OR user visited pricing page and dismissed |
| Set sender email | active `email_accounts` row for the branch with `last_verified_at` not null |
| Set up online payments (optional) | `branch_payment_gateways` row active — optional, not required to complete |
| Invite your team | at least one additional `tenant_memberships` row for this branch |

Recompute runs on portal load and after each relevant mutation (invalidate `branch_onboarding` after saves in settings, banking, pricing, email accounts, payments, invites).

## 3. Slow scrolling on order pages with 12+ photos

Applies to admin order detail and customer order detail. Likely causes to investigate and fix:

- Signed-URL thumbnails are re-requested per scroll/render instead of using the existing `pdfBlobCache` / signed-URL cache.
- Thumbnails rendered at full resolution instead of a 150-DPI (or smaller) preview.
- Missing `loading="lazy"` / `decoding="async"` on `<img>` tags.
- Re-rendering the whole document list on every parent state change (missing `React.memo` / stable keys).

Plan: profile the two order-detail pages, add lazy-loading, memoize the photo row component, and route thumbnails through the shared cache. No functional changes — pure perf.

## 4. Trial expiry — hard stop

Confirm and enforce the entitlement model already in `useBranchEntitlement`:

- Server: `resolve_branch_entitlement` returns `restricted` (or `cancelled`) once `trial_ends_at < now()` and no active subscription exists. Verify this branch of the SQL and add a scheduled job (pg_cron or edge cron) to transition `trial_status` → `expired` at the boundary so state is deterministic.
- Storefront (`useBranchStorefrontGate`): already blocks checkout when state is not `active|trialing`. Add a full-page "Store temporarily unavailable" overlay on `/t/:slug/*` instead of just blocking checkout, so trial-expired branches go dark for customers.
- Branch admin (`useBranchSubscriptionGate`): already forces billing-only. Add a persistent red banner across all admin pages while `restricted|cancelled` explaining why and linking to Subscription.
- Notifications: send email at T-3, T-1, T+0, T+3 days via `platform_campaign_triggers` so the branch is warned before the hard stop.

## 5. Admin-side quotes without artwork

New "Quote mode" on the existing configurator so admins can quote a customer with only a spec.

**Entry point**: Admin → Quotes → "New Quote" opens the customer picker, then the standard product configurator inside a `quoteMode=true` wrapper.

**Behaviour differences in quote mode**:
- Upload step is replaced by a **Spec form**: page count, size (from pack pricing or family sizes), sides, paper, quantity, finishing options. This spec seeds an in-memory "virtual document" so the rest of the engine (pricing, options, weight, delivery) works unchanged.
- No files are written to storage; a `quote_documents` row is created with `is_placeholder=true` and the spec JSON.
- Configurator computes price against pack pricing / rules exactly as if artwork existed.
- "Save Quote" writes a `quotes` row with `created_via='admin_no_artwork'` and the spec snapshot on each `quote_items` row.
- Email the customer the standard quote link.

**Customer converts quote → order**:
- Customer opens quote, clicks "Accept & upload artwork".
- Standard order flow starts, pre-filled from the quote spec, but requires real artwork upload.
- After upload, run reprice: compare actual page-count/size/sides against the quoted spec.
- If pricing differs, show a blocking banner: *"Your artwork is 32 pages, quoted for 24. Price updated from R450 to R580."* Customer must click "Accept new price" to continue; declining voids the conversion and keeps the quote open.
- Store the drift on the order (`quote_price_drift` JSON) for audit.

**Schema additions** (single migration):
- `quote_items.spec_snapshot jsonb` (may already exist — verify) storing the full quote-time spec.
- `quote_documents.is_placeholder boolean default false`.
- `orders.quoted_price numeric`, `orders.quote_price_drift jsonb` for reprice audit.

### Technical notes

- Quote mode wrapper lives in `src/pages/admin/AdminNewQuote.tsx`; reuses `OrderBuild.tsx` with a `mode="quote"` prop that swaps `OrderFiles` for `QuoteSpecForm`.
- Virtual document injected via a new `useVirtualDocumentFromSpec` hook feeding the existing `useOrderBuilder` shape.
- Reprice logic in a new `supabase/functions/reprice-quote-conversion` edge function called from the customer's upload-complete handler.
- All existing pricing/rate-card/pack-pricing code paths remain untouched.

### Rollout order

1. Fixes 1–3 (small, isolated).
2. Fix 4 (verify + banner + cron).
3. Fix 5 (largest — build behind an `admin_quote_mode` feature flag on `platform_settings` so it can be enabled per environment).
