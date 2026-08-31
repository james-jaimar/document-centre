# Company Users tab shows 0 for Laiela Paruk

## What I checked

In the database the link is correct: the membership for `laiela@ahavahconsulting.co.za` (Impress Print Calendars tenant) carries `company_id` = Ahavah Consulting. So the data is right and only the Users tab is wrong.

Access rules also look fine for a tenant admin: the memberships table allows staff of the tenant to read the rows, and table permissions are in place. That means the "Users (0)" is a front-end read problem, not a permissions or data problem — but I have not yet reproduced it while signed in as the Impress admin, so the exact cause is unconfirmed.

## Step 1 — Reproduce and confirm the cause

Sign in as the Impress Print admin in the preview and open Companies -> Ahavah Consulting -> Users, watching the network response for the members request. Two candidates:

- The request returns the row and the tab was showing a cached, pre-link result (list data is cached for 30 seconds and does not refresh on window focus; only certain actions clear it).
- The request returns nothing, in which case the read is being blocked or filtered and I fix that specific cause.

No further work is committed until this observation says which one it is.

## Step 2 — Fix based on what Step 1 shows

If it is caching:
- Clear the company members cache whenever a customer's company link changes, from every place that can change it (the customer edit dialog, the company settings card, the add-customer dialog and the link/unlink buttons), so the Users tab is correct the moment you switch to it.
- Always re-fetch the members list when the company page is opened, rather than trusting a stale copy.

If the read itself returns nothing:
- Scope the members query to the current tenant and app and fix whichever rule or filter is excluding the row, then re-verify on the same page.

## Step 3 — Verify

Reload the company page as the Impress admin and confirm Laiela appears in Users (1), then unlink and re-link from the customer record to confirm the tab updates immediately without a refresh.

## Technical notes

- Members query: `useCompanyMembers` in `src/hooks/useCustomerCompanies.ts`, key `["customer-companies", "members", companyId]`, selecting `tenant_memberships` filtered by `company_id` with an embedded `profiles` row.
- Writers to check for invalidation: `EditCustomerDialog.tsx`, `CustomerCompanySettings.tsx`, `AddCustomerDialog.tsx`, `useCompanyMemberMutations`.
- Global query defaults (`src/App.tsx`): `staleTime: 30_000`, `refetchOnWindowFocus: false`.
