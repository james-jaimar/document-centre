# Naming map: Document Centre → GASA

The schema and the engine keep Document Centre's **column names** on purpose, so
the ported code runs without a rename pass. Only the meaning changes. Rename
later if you want to, in one deliberate migration — not while porting.

| Document Centre | GASA | Notes |
| --- | --- | --- |
| tenant | **brand owner** | The apparel brand. `tenant_id` everywhere means brand owner id. |
| branch | *(unused)* | Kept as a nullable `branch_id` column so a storefront layer can be added later without touching every table. Leave it null. |
| app | **app** | Same idea: which product of the platform this row belongs to. Keep it — numbering is scoped by it. |
| customer | **customer** | The brand's end shopper. |
| order | **order** | Unchanged. |
| job (`order_jobs`) | **product line** | One apparel product being made: 40 black tees, front print, this artwork. |
| product_snapshot | **frozen product** | Immutable copy of the product as ordered. |
| configuration | **frozen options** | Size/colour/placement choices as ordered. |
| production_specs | **production spec** | What the printer/decorator needs. |
| proof | **mockup approval** | Same lifecycle: pending → generated → sent → approved/rejected. |
| print_ready / imposition columns | *(dropped)* | Print-only. GASA's equivalent would be artwork/mockup file paths. |
| fulfilment: collection / delivery / courier | **delivery** mostly | Keep the enum; brands may add collection later. |

## Role names

Document Centre roles (`owner`, `admin`, `sales`, `production`, `accounts`,
`customer`) map cleanly. For GASA, the minimum is:

- `owner` — the brand owner
- `admin` — anyone they let into the back office
- `production` — whoever fulfils (in-house or a partner)
- `customer` — the shopper

Keep them in `tenant_memberships`, not on the profile, and keep the rule that a
customer role is never enough to read another customer's order.

## Three tiers → two

Document Centre is platform → tenant → branch → customer. GASA is
platform → brand owner → customer. The branch layer is simply absent; nothing
in the order engine requires it, because every access rule that mattered was
written against `tenant_id` first and `branch_id` only as a narrowing filter.
