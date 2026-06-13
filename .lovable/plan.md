# Import 3@1 Branches

The uploaded `3at1_branches.xlsx` contains **75 branches** (all rows complete: name, address, city, province, postal code, phone, email). The `3 at 1` tenant exists (`slug: 3at1`, `app_id: a0000000…0001`) and currently has 0 branches.

## What I'll do

Insert all 75 rows into `public.branches` via a single SQL data migration, mapping the spreadsheet columns to the branches schema:

| Excel column | Branches column |
|---|---|
| `store_name` | `name` |
| `store_id` | `code` (e.g. `26659`) |
| `address` + `address2` | `address` (joined with `, `) |
| `city` | `city` |
| `province` | `province` |
| `postal_code` | `postal_code` (zero-padded to 4 digits where needed) |
| `country` | `country` (ISO code `ZA`) |
| `phone` | `phone` |
| `email` | `email` |
| derived from name | `slug` (kebab-case, required) |
| derived from name | `url_slug` (kebab-case, lowercase a-z0-9 + hyphen, reserved-word safe) |
| — | `tenant_id = a513d202-41f7-47eb-97be-47f2354b3bb1` |
| — | `is_active = true`, `is_live = false` (same as new PostNet branches — admin flips live when ready) |

Slug collisions (e.g. two branches both deriving to `paarl`) will be de-duplicated by appending the city or store_id suffix.

After insert, the `trg_clone_pricing_for_new_branch` trigger automatically clones tenant pricing to each new branch, and `seed_capabilities_for_new_family`-style seeding gives them the default product catalogue — same as PostNet.

## Out of scope (ask separately if you want them)

- Branch admin users / `tenant_memberships` — none created. Each branch will need a manager invited later.
- Branch-specific overrides (capabilities, payment gateways, credit accounts) — left at tenant defaults.
- Custom branch logos / hero imagery.
- Tenant-level branding (header/footer, auth bg) — already configured separately.

## Verification

After the insert I'll run a count + sample query to confirm all 75 rows landed and slugs are unique.
