## Investigation findings

- The quote builder currently saves a spec quote from the browser in 4 separate writes:
  1. `orders` holding order
  2. `order_items` holding item
  3. `quotes`
  4. `quote_items`
- I confirmed in the database that the latest failed attempt did create the holding `orders` row, then failed at `order_items`.
- `orders` and `order_items` now have overlapping policies from different eras:
  - legacy customer ownership policies
  - platform admin policies
  - branch/head-office read policies
  - newer staff insert policies
  - an extra helper-based `order_items` insert policy added to work around parent-order visibility
- The fragile part is that quote creation is a multi-row workflow being performed directly through table RLS from the frontend. `order_items` has to validate against a parent `orders` row that was just created, while other policies and helper functions are also in play. That is exactly the kind of path where layering more policies becomes unsafe and hard to reason about.

## Clean implementation plan

### 1. Move spec quote creation into one database RPC
Create a single `SECURITY DEFINER` function, for example `public.create_spec_quote(...)`, that performs the full quote creation atomically:

- verify the caller is authenticated
- verify the caller is valid tenant/branch staff for the provided `app_id`, `tenant_id`, and `branch_id`
- verify the branch belongs to the tenant/app when a branch is supplied
- generate the quote number inside the database
- create the hidden quoted holding order
- create the holding order item
- create the `quotes` row
- create the `quote_items` snapshot
- return `{ id, quote_number }`

This means quote creation has one controlled entry point instead of four separate frontend writes through table policies.

### 2. Stop adding quote-specific table policies
Remove the recently-added `order_items_insert_staff_membership` workaround policy and helper if they are only needed for the current quote builder path.

Keep table RLS focused on normal table ownership/visibility:

- customers manage their own cart/order rows
- tenant/branch staff can read/manage relevant operational rows where already required
- platform admins retain elevated access
- quote creation itself goes through the RPC, not direct `order_items` insertion from the browser

### 3. Keep the RPC narrow and auditable
The function will not accept arbitrary raw table payloads. It will accept only the fields the quote builder needs:

- customer identity fields
- product family and configuration/spec JSON
- quantity, unit price, total
- quote name, notes, validity period
- branch/tenant/app context

The function will set system fields itself, including `order_status = 'quoted'` and quote metadata. That prevents a branch user from using the RPC to create unrelated orders/items.

### 4. Update the Quote Builder UI to call the RPC
Replace the current `orders` → `order_items` → `quotes` → `quote_items` insert sequence in `QuoteSpecBuilder.tsx` with one `supabase.rpc('create_spec_quote', ...)` call.

The UI behaviour stays the same:

- same customer picker
- same product/spec builder
- same pricing display
- same success callback
- same toast on error

### 5. Add cleanup for partial failed holding orders
Add a safe cleanup step for orphaned spec-quote holding orders created by failed attempts:

- `order_status = 'quoted'`
- `metadata.is_spec_quote_holding = true`
- no related `order_items`
- no related `quotes`

This avoids leaving half-created quote data behind.

### 6. Verify with database and browser checks
After implementation:

- create a branch quote as the branch manager
- confirm exactly one holding order, one order item, one quote, and one quote item are created
- confirm no orphan holding orders remain
- confirm the customer/member visibility rules still allow the quote to be listed/reactivated
- run the Supabase linter and address only findings related to this change

## Why this is cleaner

The current approach asks RLS to coordinate a multi-table business transaction from the browser. The cleaner model is:

```text
Frontend quote builder
        |
        v
create_spec_quote RPC
        |
        +-- validates staff access once
        +-- writes order/order_item/quote/quote_item atomically
        +-- returns quote id + quote number
```

That reduces policy sprawl, removes the fragile parent-order insert check, and gives us one place to audit the quote creation rules.