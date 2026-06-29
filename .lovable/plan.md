## Plan

1. **Fix the sender mismatch**
   - Re-check the marketing send path so the selected branch IDs from the Communications page are resolved against the selected tenant reliably.
   - Ensure dry-runs and real sends both return the exact branch result instead of the generic “no recipients” state.

2. **Make activation links unambiguous**
   - Keep `{{activation_link}}` as the dynamic token that auto-creates/reuses the branch activation page.
   - Update the preview/help text so it is clear that the preview URL is only a sample and the real email gets the actual per-branch URL.
   - If a dry-run succeeds, show the generated real activation URL in the Results panel so it can be clicked/copied for testing.

3. **Improve the failure message**
   - Replace the current vague “Refresh and try again” toast with the actual server detail: selected tenant, requested branch count, matched count, and any missing branch result.
   - This will make future test failures diagnosable from the UI without guessing.

4. **Verify with the Demo2 branch**
   - Use the existing Demo2 branch (`admin@jaimar.dev`) on PostNet South Africa to confirm the dry-run resolves 1 branch and returns its activation URL.
   - Deploy the updated marketing send function if the edge function code changes.

## Technical notes

- Likely files: `src/pages/platform/PlatformCommunications.tsx` and, if needed, `supabase/functions/send-branch-marketing-campaign/index.ts`.
- No schema change planned.
- No change to the demo gate or activation-page security model.