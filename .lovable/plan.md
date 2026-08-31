# Company Users tab shows 0 — confirmed cause

## What the network tab shows

Every request for company users returns **400**. Reproducing it directly against the API gives:

> Could not find a relationship between 'tenant_memberships' and 'profile_id'

The memberships table has no declared link to the profiles table, so the combined "membership + person details" request is rejected outright. The link itself is fine in the data: Laiela's membership does carry Ahavah Consulting, which is why the customer's own edit screen shows the company. Only the company-side list is broken, and it silently renders as "Users (0)".

The same failure hits the "Link an existing customer" dropdown (the second red request), which is why that list is empty too.

## The fix

Split the two company queries into two plain steps — fetch the memberships, then fetch the matching people — exactly the pattern already used by the Users & Roles page, which works. No combined request, so no dependency on a declared table relationship.

Applies to both:
- the company Users tab list
- the "customers not yet attached to a company" picker

Also surface failures instead of showing a silent zero: if the list request errors, the tab shows a short "couldn't load users" message rather than "Users (0)".

## Verify

Reload Companies -> Ahavah Consulting -> Users as the Impress admin and confirm Laiela Paruk appears with her email, the tab reads Users (1), and the network requests return 200. Then confirm the picker lists unattached customers again.

## Technical notes

- `useCompanyMembers` and `useUnlinkedCustomers` in `src/hooks/useCustomerCompanies.ts` currently embed `profiles:profile_id (...)`; replace with a memberships select followed by a `profiles ... .in("id", ids)` select and a client-side merge, mirroring `src/hooks/useTenantMembers.ts`.
- Keep the returned `CompanyMember` shape unchanged so `CompanyUsersPanel` and `CompanyDetailView` need no changes beyond an error state.
- No database or access-rule changes required.
