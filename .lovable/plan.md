## Import PostNet store list

You uploaded `postnet_all_stores.flattened.csv` with **506 stores**. The PostNet tenant currently has **60 branches** seeded. We'll bulk-import the rest and leave existing ones untouched.

### Approach

1. **Parse CSV** locally (`/tmp/postnet.csv`) — 506 rows, columns: `code, store_name, email, telephone, suburb, postal_code, latitude, longitude, criminal_record_check_enabled, delivery_to_door, online_account_number, online_shop_enabled, physical_address, region, tag_name, town`.

2. **Match against existing branches** for tenant `PostNet` (`c0000000-…-0002`):
   - Primary match: `branches.external_ref` = CSV `code` (Mongo-style id from PostNet).
   - Fallback match: `branches.slug` = CSV `tag_name` (e.g. `atterbury`, `arconpark`).
   - Any row matching either is **skipped** (no updates to existing rows — per your instruction "ignore those").

3. **Insert new branches** with this field mapping:

   | branches column | CSV source |
   |---|---|
   | tenant_id | PostNet tenant id (fixed) |
   | external_ref | `code` |
   | slug | `tag_name` (deduped with numeric suffix if collision) |
   | code | uppercased `tag_name` (or store code) |
   | name | `PostNet ` + Title-cased `store_name` |
   | email | `email` |
   | phone | `telephone` (trimmed) |
   | address | `physical_address` |
   | suburb… wait, no `suburb` col → folded into `address` |
   | city | `town` |
   | province | Title-cased `region` (e.g. `Gauteng`) |
   | postal_code | `postal_code` |
   | country | `ZA` |
   | is_active | `true` |
   | settings (jsonb) | `{ latitude, longitude, criminal_record_check_enabled, delivery_to_door, online_shop_enabled, online_account_number, source: 'postnet_csv_2026_05' }` |

4. **Slug uniqueness**: slugs are unique per tenant in practice. We'll lowercase + hyphenate `tag_name`; on the rare collision (different store, same tag) append `-2`, `-3`, etc.

5. **Branch capabilities**: do NOT auto-create `branch_capabilities` rows — existing branches were seeded with their own capabilities and the new ones can be enabled later via the admin Branches page (or a follow-up bulk action). This keeps the import focused on identity/contact data.

6. **Execution**: a single one-shot Node script that:
   - reads the CSV,
   - selects existing `external_ref` + `slug` for the PostNet tenant via Supabase,
   - builds the insert batch (skipping matches),
   - inserts in chunks of 100 via the service-role-equivalent (using your dev psql access through a migration-style insert is not appropriate for ~450 rows of data — we'll use `supabase-js` with the publishable key plus a temporary RLS-friendly path, OR simpler: generate a single SQL `INSERT … ON CONFLICT DO NOTHING` and run it via a data-only migration).
   - The cleaner option is **a SQL migration that inserts the rows** with `ON CONFLICT (tenant_id, slug) DO NOTHING` and `ON CONFLICT (tenant_id, external_ref) DO NOTHING`-style guards (we'll add a partial unique index if not present, or pre-filter in the script and emit only the needed inserts).

### Deliverable
- `supabase/migrations/<ts>_import_postnet_stores.sql` containing only `INSERT INTO public.branches (...) VALUES (...), (...), ... ;` for the new stores (≈446 rows after dedupe).
- A short report in chat: how many were skipped vs inserted, plus any rows with missing email/phone/coords flagged for your review.

### Open question
- **Province formatting**: CSV has `GAUTENG`, `EASTERN CAPE`, `KWAZULU-NATAL`. Existing branches likely use `Gauteng`, `Eastern Cape`, `KwaZulu-Natal`. I'll Title-case with a small overrides map (`KwaZulu-Natal`, `Northern Cape`, etc.). Shout if you want raw uppercase kept.
