# Reuse an existing email on a different tenant

## What's happening

Sign-in identities live in one shared auth directory for the whole platform, so an email address can only exist once across all tenants. At checkout on the Impress storefront the "New Account" form tries to convert your anonymous browsing session into a brand-new account with `james_b_hawkins@yahoo.com`, and the directory rejects it because that address already exists (it was created on another tenant). Hence "A user with this email address has already been registered".

Confirmed from the data: that email has one profile record, it is not anonymous, and it currently holds exactly one tenant membership.

Customer *visibility* is already separated: the tenant customer list is built from `tenant_memberships` filtered by tenant, so another tenant's customers do not appear. Nothing in this plan widens that.

So the fix is not to duplicate the email — it is to let the same login be attached to this tenant as a separate customer record, silently.

## Changes

### 1. Checkout "New Account" recovers instead of erroring

In `src/components/checkout/CheckoutAuth.tsx`, when creating the account fails because the email already exists:

- Try signing in with the password the customer just typed.
  - Success: attach them to this tenant (below), claim their anonymous cart, continue to checkout — no error shown.
  - Wrong password: replace the red error with a friendly message — "You already have a login for this email. Enter your password to continue, or reset it." — switch to the Sign In tab, prefill the email, and show a "Forgot password" link.
- Apply the same for both cases in the form (anonymous session upgrade and no-session signup).

### 2. Attaching an existing login to the current tenant

Add a small `ensure-tenant-membership` edge function (service role) that, given the signed-in user and the current tenant slug:

- Creates a `customer` membership row for this tenant if one is missing.
- Copies the first name / last name / phone typed at checkout onto the profile only where those fields are blank.
- Never touches another tenant's membership.

Call it after a successful checkout sign-in as well, so signing in on a tenant the customer has not used before also enrolls them there.

### 3. Stop the cross-tenant side effect on the profile

`request-signup` currently sets `profiles.tenant_id` to the newest tenant whenever it adds a membership. For a customer who shops at two tenants this rewrites their "home" tenant. Change it to set `tenant_id` only when it is currently empty; tenant scoping continues to come from `tenant_memberships`.

## Technical notes

- No schema changes. `tenant_memberships` already supports one profile across many tenants (unique per profile + tenant + app).
- Per-tenant customer data (orders, addresses, companies, notes, trade flags, credit) is already keyed by tenant, so the same person is effectively two independent customer records.
- The shared items are the login credential, the display name/phone on the profile, and password resets — unavoidable while all tenants share one auth directory.
