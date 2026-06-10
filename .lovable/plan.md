## Plan: make platform Microsoft email connect feel complete

### What I found
- The platform mailbox was created successfully for `hello@document-centre.com`.
- The remaining issue is the callback page/popup experience: it is showing raw callback HTML/script content in an ugly way even though the connection succeeded.

### Changes to make
1. **Clean up the Microsoft callback page**
   - Return a proper success/failure page with clear messaging.
   - Ensure the displayed text matches the actual result.
   - Avoid showing raw JSON/script fragments to the user.
   - Keep the `postMessage` callback so the platform settings tab can refresh automatically.

2. **Improve the platform email connection UX**
   - After a successful callback, refresh the account list and show the connected mailbox.
   - Use a clearer success toast for platform-scope connection.
   - Handle popup-close and callback-message cleanup more safely.

3. **Verify existing database state**
   - Keep the existing successful platform email row.
   - No further schema change is needed for the current reported issue.

### Technical notes
- The edge function already inserts/updates platform-scoped email accounts correctly after the `tenant_id` nullable fix.
- The callback page will be updated inside `microsoft-oauth-connect` only.
- The frontend change is limited to `PlatformEmailTab` for better refresh/error handling.
- After implementation, deploy the updated edge function and verify the callback no longer exposes raw script content.