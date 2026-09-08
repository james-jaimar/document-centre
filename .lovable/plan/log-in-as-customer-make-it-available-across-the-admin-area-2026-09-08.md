# Log in as customer — make it available across the admin area

Yes, you asked for it and it was built — but it was only ever wired into the **branch** portal's Customers list (and the "add customer" dialogs). Nothing in the tenant admin area exposes it, which is why you couldn't find it.

What already exists and works:
- A "Log in as customer" action that opens a **new browser tab** signed in as that customer.
- An amber banner across the top of that tab: "Viewing as customer … — actions are audited. Online card payments are disabled." with an Exit button.
- A 30-minute idle timeout and a hard session expiry.
- Every session written to an audit trail (who, which customer, when, IP, and why it ended).
- Blocking of impersonating other staff or platform admins.

## What to add

1. **Tenant admin → Customers list**
   Add "Log in as customer" to the top of the row actions menu (the "…" button), disabled when the customer has no email. This single change also gives the action to every other screen that reuses that menu (customer detail, company detail, and anywhere else customers are listed).

2. **Tenant admin → Customer detail page**
   Add a prominent "Log in as customer" button next to the existing actions, so it's obvious from the customer's own page.

3. **Tenant admin → Order detail**
   Add "Open as customer" to the order's action menu, landing straight on that order in the customer's own view — handy when you're on the phone with them.

4. **Where it lands them**
   From branch screens it opens that branch's storefront (already the case). From tenant admin it opens the tenant's storefront home; if a branch is selected in context, that branch's storefront instead. From an order, it opens that order's page.

5. **Consistency and safety wording**
   Show a short confirm step before starting, spelling out the same reassurance PrintJob shows: actions are recorded as done by the customer, no emails are sent to the customer for actions you take, and card payments are disabled while viewing as them.

## Technical notes

- Frontend only; the `impersonate-customer` / `end-impersonation` edge functions and the `caller_can_impersonate` authorisation rule stay as they are.
- Add an `extraItems` entry in `src/components/admin/CustomerRowActions.tsx` that calls `startImpersonation` from `ImpersonationContext` (mirrors `src/pages/branch/BranchCustomers.tsx`), so it flows to all consumers of that menu.
- Resolve the destination path from tenant slug (`/t/{slug}`) with branch slug override when `branchId` is set; order deep link uses the existing customer order route.
- Add the confirm dialog as a small shared component so branch and tenant screens behave identically.
- Suppressing customer-facing emails during an impersonated session is *not* currently enforced anywhere; if you want that guarantee it needs a separate pass over the send paths and is not included here.
