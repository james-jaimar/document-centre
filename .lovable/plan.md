## Plan: fix Platform Communications email sending

I found the likely failure point: the marketing campaign rows are being created with `total_recipients = 0`, and no recipient rows are created, even though the UI says “1 selected”. That means the Edge Function is receiving branch IDs, but its branch lookup returns no rows, so it finishes as “Campaign sent” with `Sent 0 · Failed 0 · Skipped 0` instead of surfacing an error.

### What I’ll change

1. **Harden the marketing send Edge Function**
   - Validate that the selected branch IDs actually resolve to branches for the selected tenant.
   - If zero branches resolve, return a clear error instead of creating an empty successful campaign.
   - If only some selected branches resolve, include a clear skipped/missing result so the UI is honest.
   - Remove/repair the invalid `app_id` assumption in the branch query path so it cannot silently break on branches where that field is not present.

2. **Improve the Communications page send feedback**
   - Use the verbose Edge Function caller so server error details show in the toast instead of generic Supabase messages.
   - Treat `sent=0, failed=0, skipped=0` as a failure state when branches were selected.
   - Show per-recipient errors in the Results panel, not just a badge.

3. **Add a quick dry-run sanity guard**
   - Dry run should report the exact selected branch count and activation link generation result.
   - If it cannot resolve selected branches, it should fail visibly before a real send.

4. **Deploy and verify the Edge Function**
   - Deploy `send-branch-marketing-campaign` after the code change.
   - Check recent campaigns/logs again to confirm a selected Demo branch now produces either a queued/sent result or a concrete error message.

### Expected outcome

Clicking **Send to 1 branch** will no longer produce a misleading “Campaign sent / Sent 0” result. It will either actually create the recipient/send the email, or show the real reason it could not send.