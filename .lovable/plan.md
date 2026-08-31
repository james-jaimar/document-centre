# Custom Domain Go-Live: the2027edition.com

## Goal
Point `the2027edition.com` at the Document Centre storefront using AWS Amplify as the SSL/TLS terminator (direct-to-Amplify path).

## Why this is required
The app already supports two tenant host patterns:
- `{slug}.document-centre.com` — served by Amplify's wildcard/subdomain config.
- A custom domain stored in `tenants.custom_domain` — resolved by `useTenantFromHost.ts`.

For `the2027edition.com` to work, the request must reach Amplify with a valid certificate for that hostname. CNAME'ing to a tenant subdomain alone does not provision that certificate; the domain must be registered in Amplify so ACM can issue a cert.

## Steps

### 1. Confirm the tenant slug and subdomain
- In the admin portal, find the tenant for "The 2027 Edition".
- Note its slug (e.g. `the2027edition`).
- Verify `https://{slug}.document-centre.com` already loads the storefront.

### 2. Add the domain in AWS Amplify
- Open the AWS Amplify console for the Document Centre app.
- Go to **Domain management** → **Add domain**.
- Enter `the2027edition.com`.
- Choose to include `www.the2027edition.com` if you want both apex and www to work.
- Wait for Amplify to generate the required DNS records (CNAME/ANAME/A for the apex, CNAME for www, plus a TXT verification record).

### 3. Configure DNS at the registrar
- Log in to the registrar/DNS provider for `the2027edition.com`.
- Add the exact records Amplify provided:
  - Apex: ANAME/ALIAS or A records as shown.
  - `www`: CNAME to the Amplify target.
  - Verification: TXT record as shown.
- Do **not** use the older "CNAME to `{slug}.document-centre.com`" instructions from the in-app Domains tab for this path; that path is for users who want to hide behind an existing subdomain, but it still needs Amplify to know the apex.

### 4. Wait for Amplify verification
- In Amplify, the domain will move through **Verifying** → **SSL configuring** → **Active**.
- This can take 15–60 minutes (sometimes longer for propagation).

### 5. Save the custom domain in the app
- In the tenant admin **Settings → Domains** tab, enter `the2027edition.com` and save.
- Click **Verify DNS**. The `verify-domain` Edge Function checks for a CNAME/A record pointing to a known platform host (`document-centre.com`, `amplifyapp.com`, or `lovable.app`).

### 6. Add Supabase Auth redirect URLs
- In Supabase → Authentication → URL Configuration → Redirect URLs, add:
  - `https://the2027edition.com/auth/callback`
  - `https://the2027edition.com/**`
- If using `www`, also add:
  - `https://www.the2027edition.com/auth/callback`
  - `https://www.the2027edition.com/**`
- This prevents Google OAuth from falling back to `document-centre.com` after login.

### 7. Test end-to-end
- Visit `https://the2027edition.com` — should load the tenant storefront, not the Document Centre marketing site.
- Visit `https://the2027edition.com/t/{slug}` — should redirect or serve the same storefront (the subdomain router treats custom domains as tenant hosts).
- Add a product to cart, proceed to checkout, and log in with Google to confirm the redirect URLs work.

## Optional follow-up work
- If you want customers to self-serve this in the future, update the in-app **Domains** tab to explain the direct-to-Amplify path and auto-suggest the exact DNS records from Amplify.
- Add a canonical redirect: force `www` → apex (or vice versa) in the app or at DNS level to avoid duplicate content.

## Out of scope for this plan
- No code changes are required for the domain to go live; this is an infrastructure/DNS task.
