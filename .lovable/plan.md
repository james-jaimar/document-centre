# Company users in the edit dialog + a proper customer edit form

Two gaps in the new B2B screens.

## 1. Edit company has no users section

The "Add user" and "Link existing customer" controls only live on the company detail page (Users tab). When you open **Edit company** from the Companies list you get the business profile only, with no hint that users exist elsewhere.

Add a **Users** section at the bottom of the Edit company dialog (shown only when editing a saved company, not while creating a new one):

- List of linked users: name, email, job title, primary-contact star, remove.
- **Add user** button — opens the full Add customer form with this company pre-selected and locked.
- **Link existing customer** picker for people who already have an account.
- While creating a brand new company the section shows a short note: users can be added once the company is saved.

This reuses the exact controls already built for the detail page, so both surfaces behave identically.

## 2. Edit customer is too thin

The Edit customer dialog only has first/last/display name, email and phone. It doesn't show or let you change anything that makes someone a company user or a trade account, so it looks unrelated to the company they belong to.

Expand it into a single form with three groups:

- **Personal** — first name, last name, display name, email, phone (as today).
- **Company** — company selector (search/pick, or "None"), job title, and a "Primary contact for this company" toggle.
- **Account** — trade customer toggle and MIS account number, with a note when these are inherited from the company.

Saving writes the profile fields and the membership fields together, and refreshes the customers list, the customer detail page and the company's user list.

## Technical notes

- Extract the Users tab body of `CompanyDetailView` into a shared `CompanyUsersPanel` component; mount it in both `CompanyDetailView` and `CompanyFormDialog` (guarded on `company?.id`).
- `EditCustomerDialog` gains an optional `membershipId` plus current membership values; company/job title/primary/trade/MIS updates go through `useCompanyMemberMutations`-style updates on `tenant_memberships` (same fields `CustomerTradeSettings` and `CustomerCompanySettings` already write).
- Setting primary contact clears the flag on the company's other memberships, matching existing behaviour.
- Invalidate `tenant-customers`, `tenant-customer`, `branchCustomers` and `customer-companies` (list, one, members, unlinked) on success.
- No database or edge function changes.
