## Goal

Give each PostNet branch self-service control over: (1) outbound email account, (2) branch staff, (3) PayFast merchant credentials — while keeping data strictly ringfenced per branch. Tenant-wide PayFast is enabled but credentials are entered per branch.

## 1. Per-branch email (SMTP/Graph/Gmail) — edge function path

Infrastructure already exists: `email_accounts` table has `branch_id`, vault-stored secrets, transport variants. Gaps are scoping + permissions + dispatcher resolution + test-send UX.

**Backend**
- Loosen `email-account-manage`: when `branch_id` is set, accept tenant_admin OR active `branch_manager` of that branch. Tenant-wide accounts (branch_id null) stay tenant-admin only.
- Tighten RLS on `email_accounts` to enforce the same rule (branch managers can only see/edit rows for their branch).
- `email-dispatcher` account resolution: when an outbox row has `branch_id`, prefer that branch's active default account; fall back to tenant default (no branch); only fall back to Graph as last resort. Honour the row's transport, not Graph-only.
- `send-email` already passes `branch_id` — verify all order-related callers pass `order.branch_id` so emails route through the correct account.
- New `send-email-test` edge function: takes account id + a target address, sends a small canned email through that exact account, records success/failure on `email_accounts.last_verified_at` / `last_error`. Branch manager can use this from the UI before saving.

**Frontend (new `BranchSettings` "Email" tab)**
- Reuse existing `EmailAccountsTab` logic but scope queries to `branch_id = current branch`, hide tenant-wide accounts, and pre-fill `tenant_id` + `branch_id` on create.
- Add "Send test email" button next to each account.
- Inline help: "These credentials are used only to send emails to your customers. They are encrypted and never visible to other branches or staff outside your branch."

**Future VPS path (not built now)**
- Document a `POST /send-email` contract on the Ubuntu API with the same payload as `send-email`. When ready, flip a tenant_settings flag `email.transport_backend = "vps" | "edge"`; `send-email` becomes a thin router. No schema change needed.

## 2. Branch staff invites

Roles already exist (`branch_manager`, `store_operator`). Tenant admin invites `branch_manager`s today (`AddMemberDialog` + `invite-member`). New work:

- `invite-member` edge function: accept caller who is an active `branch_manager` of the same branch. Allowed roles for that caller = `store_operator` only. Force `branch_id` on the created membership to the caller's branch — ignore any client-supplied branch.
- New `BranchSettings` "Users" tab listing memberships where `branch_id = current branch`, with invite + deactivate. Reuse existing member-list components, just filtered.
- Tenant admin keeps full control via the existing `AdminUsers` page.

## 3. Tenant-wide PayFast on / per-branch credentials

Schema already supports it (`tenant_payment_gateways` + `branch_payment_gateways` + `resolveGatewaysForOrder` already prefers branch creds when present and filters PayFast to ZAR orders).

- Tenant admin → Settings → Payments: toggle `payfast.is_enabled = true` for the PostNet tenant (no creds needed at tenant scope — branches will supply them). Display a clear notice: "Each branch must enter their own PayFast credentials before it becomes available to their customers."
- `payments-list-providers` (or whichever resolves what's available at order time): only surface PayFast for an order when the order's branch has a credentials row. Branches without creds → PayFast is hidden from their customers.
- `BranchSettings` "Payments" tab already exists for Stripe — extend it with a PayFast section: merchant_id / merchant_key / passphrase / mode (test/live). Save via existing `payments-save-credentials` with `scope=branch`.
- `payments-save-credentials` already enforces tenant owner/admin; extend the permission check to also allow active `branch_manager` of the target branch when `scope=branch`.
- **Ringfencing guarantees** (must verify):
  - RLS on `branch_payment_gateways`: select/update/delete only when `user_is_tenant_admin(tenant)` OR caller is active `branch_manager` of `branch_id`.
  - PayFast ITN handler resolves the `branch_id` from `m_payment_id` (attempt row) and credits that branch's attempt only — already true via `order_payment_attempts.branch_id`. Add a defensive check that the signature was computed with that branch's passphrase.
  - Add a DB constraint: `branch_payment_gateways` unique on `(branch_id, provider)` (likely already there — verify).

## 4. Extras you approved

- **EFT bank details on `branches`**: add `bank_name`, `bank_account_name`, `bank_account_number`, `bank_branch_code`, `bank_swift` (nullable). Surface on proforma/invoice rendering when the order's payment method is EFT.
- **Operating hours & contact**: add `operating_hours jsonb` (per-weekday open/close) and `public_phone`, `public_email` to `branches`. Already partly there — verify and fill gaps. Show on storefront branch page.
- **Test-send for SMTP**: covered in §1.

## Technical details

**Migrations**
1. `branches`: add bank_* columns + operating_hours jsonb + public_phone/public_email if missing.
2. RLS update on `email_accounts`: branch managers can CRUD rows where `branch_id = user_branch_id()`.
3. RLS update on `branch_payment_gateways`: branch managers can CRUD rows for their branch.
4. Verify unique `(branch_id, provider)` index on `branch_payment_gateways`.

**Edge functions**
- `email-account-manage` — permission relaxation for branch-scoped accounts.
- `email-dispatcher` — branch-aware account selection + honour stored transport.
- New `send-email-test` — one-shot verification send.
- `invite-member` — accept branch_manager caller for `store_operator` invites, force branch_id.
- `payments-save-credentials` — accept branch_manager for own branch.
- `payments-list-providers` — hide PayFast from a branch's order when no branch creds exist.

**Frontend**
- `BranchSettings.tsx`: add `Email` and `Users` tabs; extend `Payments` tab with PayFast section.
- New components: `BranchEmailAccountsPanel`, `BranchUsersPanel`, `BranchPayfastForm`, `TestSendEmailButton`.
- Tenant `PaymentsTab`: PayFast on/off toggle + informational banner.
- Invoice/proforma renderer: show branch bank details when EFT.

**Out of scope (this iteration)**
- Building the VPS email worker. We design the contract only.
- Migrating Stripe to branch-managed (already supported, no change).
- Marketing / bulk email.
