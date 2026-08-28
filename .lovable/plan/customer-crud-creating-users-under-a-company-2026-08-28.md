# Customer CRUD + creating users under a company

## 1. Customer CRUD in the tenant admin

Today the Customers list (`/admin/customers`) is read-only: rows link to the detail page, and the only editing action anywhere is the "Edit customer" dialog on the detail page. There is no way to deactivate, delete, resend an invite or set a password from the list.

Add a row actions menu (three dots) on each customer row with:

- **Edit details** — opens the existing edit dialog (name, email, phone) inline from the list.
- **Resend invite / send password reset** — sends the "set your password" email again.
- **Set password** — staff types a password for the customer (useful for walk-in accounts).
- **Disable / Enable account** — blocks or restores sign-in.
- **Delete customer** — confirmation dialog first; removes the account.
- **Remove from this tenant** — keeps the account but detaches the membership, for customers who belong elsewhere.

The same actions get an "Actions" menu in the header of the customer detail page so both surfaces behave identically. Trade status, MIS account number and company link stay where they already are on the Account tab.

## 2. Creating users for a company

Right now a company's Users tab can only attach a customer that already exists and is not yet linked to any company. There is no way to create a brand new user from there.

- Add an **"Add user"** button on the company Users tab that opens the full Add customer dialog with the company pre-selected and locked, so the new person is created and linked in one step.
- Keep the existing "link an existing customer" picker next to it for people who already have accounts.
- After creation the list refreshes and the new person appears as a company user, inheriting the company's trade status, account number and credit terms.
- Same behaviour in the branch admin company page.

## Technical notes

- All destructive/auth actions route through the existing `manage-user` edge function via `useManageUser` (`force_password_reset`, `set_password`, `disable_account`, `enable_account`, `delete_account`, `remove_membership`, `update_profile`) — no new backend or database work.
- `AddCustomerDialog` gains optional `lockedCompanyId` / `onCreated` props; when set, the company selector renders as fixed text and the membership row is written with that `company_id`.
- `CompanyDetailView` gets the button and passes `companyId` through; invalidates `customer-companies` members plus `tenantCustomers` / `branchCustomers` queries on success.
- List actions live in a small shared `CustomerRowActions` component used by both `AdminCustomers` and `AdminCustomerDetail`.
