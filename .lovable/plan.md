Delete all `email_outbox` rows for PostNet Sandton City (`50af6453-1a97-4a1a-bf5b-e3c5b12cf66c`) so the branch starts with a clean Sent Mail view.

## Steps

1. Count rows in `email_outbox` where `branch_id = '50af6453-1a97-4a1a-bf5b-e3c5b12cf66c'` so we know what we're about to wipe.
2. Delete those rows via the migration tool (one-shot SQL).
3. Related `email_events` rows reference outbox by `email_outbox_id` — check FK behaviour; if not ON DELETE CASCADE, delete the matching `email_events` rows first.
4. Leave `email_accounts`, tenant-level mail, and all other branches untouched.

## Scope

- **Deleted**: `email_outbox` (and dependent `email_events`) for this branch only.
- **Preserved**: everything else — branch config, subscription, members, customers, other branches' mail.

No code changes, no new edge function — this is a one-shot SQL cleanup via migration, same pattern as the order wipe.