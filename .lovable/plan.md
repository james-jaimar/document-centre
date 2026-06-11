## What is actually happening

There are two separate failures, not one:

1. **Document Centre Demo tenant test** used the tenant mailbox row `transport = graph_oauth` and failed while refreshing the delegated OAuth token with `AADSTS90013`.
2. **Platform mailbox test** used the new platform row `transport = graph` and got a Graph `403 ErrorAccessDenied`, which means Microsoft issued an app-only token but Exchange/Graph would not allow the app to send as `hello@document-centre.com` yet.

So reauthenticating the demo tenant cannot fix the platform sender, and provisioning the platform sender cannot fix the tenant delegated OAuth row. The app currently lets these two paths blur together, which is why this has become confusing.

## Plan

### 1. Stop platform mail from ever using delegated OAuth
- Remove/deactivate any platform-scoped `graph_oauth` account.
- Keep exactly one platform default sender: `hello@document-centre.com` using `transport = graph` app-only auth.
- Make the platform email card clearly show when Graph token acquisition works but send-as permission is still failing.

### 2. Fix the Microsoft Graph app-only setup checks
- Extend the platform Graph configuration function so provisioning does not only test the token endpoint.
- Add an actual Graph send diagnostic/test path that distinguishes:
  - invalid tenant/client/secret,
  - missing `Mail.Send` application permission/admin consent,
  - Exchange app access/RBAC restriction blocking `hello@document-centre.com`,
  - mailbox not found/licensed.
- Save the exact diagnostic on the account row so the UI tells us what Microsoft rejected.

### 3. Clean up tenant Microsoft OAuth separately
- Treat tenant `graph_oauth` as a separate delegated mailbox feature.
- Update the delegated OAuth refresh logic to match Microsoft’s v2 expectations more strictly and add better diagnostics around the refresh-token request.
- Keep tenant self-serve Microsoft OAuth available, but do not use it for the platform service mailbox.
- For the current Document Centre Demo row, mark the broken connection clearly so it can be disconnected/reconnected after the code path is corrected.

### 4. Add platform Sent Mail / mail control
- Create a platform Sent Mail page that reads `email_outbox` rows with `tenant_id = null`.
- Add it to `/platform/sent-mail` and the platform sidebar.
- Reuse the existing Sent Mail controls: status/category filters, search, detail drawer, HTML/text/metadata preview, cancel queued email.
- Show provider/account information so platform subscription/admin emails can be audited separately from tenant mail.

### 5. Reduce duplicate Sent Mail code
- Extract the existing admin/branch sent-mail table into a reusable component with a scope option:
  - platform: `tenant_id is null`
  - tenant: `tenant_id = active tenant`
  - branch: `tenant_id + branch_id`
- Keep behaviour unchanged for tenant admin and branch sent mail.

### 6. Validate against real data
- Check the latest `email_accounts` and `email_outbox` rows after changes.
- Send one platform test email through the platform account and verify it either sends or reports the exact remaining Microsoft permission issue.
- Confirm the platform Sent Mail page shows the failed and queued platform rows.

## Azure/Exchange action likely still needed

The platform app registration screenshot shows the right IDs for the new app-only path:

- Tenant ID: `57593206-dca7-4402-84ac-a17dee9ec009`
- Client ID: `b49ffe95-83b9-44fc-a5ae-36cfd65de84b`

The current platform `403 ErrorAccessDenied` usually means the app-only token is valid, but Microsoft 365 has not granted the app permission to send as that mailbox. The likely final Microsoft-side check is:

- API permissions: Microsoft Graph **Application** permission `Mail.Send`, with admin consent granted.
- Exchange Application RBAC/ApplicationAccessPolicy either not restricting the app, or explicitly allowing `hello@document-centre.com`.

I will not guess beyond that; the implementation will surface the exact Graph/Exchange diagnostic in the app so we can see which Microsoft-side permission is missing.