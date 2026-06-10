## Plan

1. **Confirm the connection result**
   - The Microsoft account is now saving successfully in the database as `graph_oauth` for `hello@document-centre.com`.
   - Treat the remaining issue as a popup/callback UX problem, not a failed Microsoft connection.

2. **Harden the OAuth callback page**
   - Update the Microsoft callback HTML generation so the success payload is assigned as a normal JavaScript object instead of using object spread inside `postMessage`.
   - This avoids fragile inline-script parsing and should stop the callback page from visibly rendering script fragments.

3. **Keep the opener refresh behavior**
   - Preserve the existing `window.opener.postMessage(...)` flow so the admin/branch email UI still receives the success message, refreshes account data, and shows the connected toast.

4. **Apply the same safety pattern to Gmail only if the same helper pattern exists there**
   - Check the Gmail OAuth callback function for the same inline spread pattern.
   - If present, update it consistently so both OAuth popups behave the same way.

5. **Deploy and verify**
   - Deploy the affected OAuth function(s).
   - Verify recent logs show no callback errors and ask you to retry the Microsoft sign-in once more.