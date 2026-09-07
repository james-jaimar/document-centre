# Stop trade customers reverting to consumer pricing

## Confirmed diagnosis

The email change did **not** reset the trade flag. The live Impress Print data currently has two active customer memberships for `james@testcompany.com` in the same tenant:

- the branch/company-linked membership is marked **Trade**
- a second tenant-level membership is marked **Consumer**

The storefront pricing lookup and parts of the customer admin use a single-row lookup even though the current order and sign-in flows can create more than one membership. That makes the result ambiguous and can leave the customer on consumer pricing. The same conflicting duplicate pattern currently affects one other Impress Print customer as well.

## Implementation

1. **Repair the affected customer data**
   - Preserve James's existing branch and `TEST COMPANY` link.
   - Make every active Impress Print customer membership for James consistently trade.
   - Repair the other confirmed conflicting Impress Print customer using the same rule: if any active membership is trade, all of that customer's active memberships in that tenant become trade.

2. **Make trade status tenant-wide and deterministic**
   - Replace single-row membership reads in customer pricing with a multi-row resolution.
   - A signed-in customer receives trade pricing when **any active membership in the current tenant** is trade, or when any active linked company is trade.
   - Resolve MIS account and payment terms from the applicable company/branch record without allowing a later default consumer row to override trade status.

3. **Fix customer administration**
   - Load duplicate memberships safely instead of using a single-row query that fails when multiple rows exist.
   - Saving “Trade customer” will update all of that customer's memberships in the current tenant, so returning to the page shows the same status that pricing uses.
   - Keep branch, company, primary-contact and job-title fields attached only to their intended membership rather than copying them indiscriminately.

4. **Stop unnecessary conflicting memberships being created**
   - Update order, signup and Google sign-in membership checks to recognise an existing customer membership before inserting another tenant-level default row.
   - Preserve legitimate branch memberships while preventing a new default `false` trade flag from competing with an existing trade record.

5. **Regression coverage and verification**
   - Add tests for a customer with both tenant-level and branch-level memberships, including conflicting historical flags.
   - Verify trade → consumer and consumer → trade changes are deliberate and consistent across admin, refresh, sign-in and checkout.
   - Re-query James's live Impress Print records after the repair and confirm the storefront pricing resolver returns trade.

## Technical details

- The existing membership model permits branch-scoped rows, so this will not remove legitimate branch associations or impose a one-row-per-tenant constraint.
- The durable rule will be: **trade is tenant-wide for a customer; branch/company linkage remains branch-aware**.
- The data repair will be narrowly scoped to confirmed conflicting Impress Print records, while the code fix prevents the same issue across all tenants.
