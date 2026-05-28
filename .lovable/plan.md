The user reports that tapping the tenant logo in the mobile header navigates to the external origin website (e.g. postnetprintcentre.com) instead of staying inside the portal. On mobile, users expect the logo = home.

Investigate and fix:
1. Verify `MobileHeader.tsx` logo link target. It currently links to `tenantPath("print-centre")`, but if an `originUrl` redirect or facsimile header intercept is firing, neutralise it for the mobile shell.
2. Check `CustomerLayout.tsx` to confirm the mobile/desktop split is clean and that no desktop header code path leaks onto mobile viewports.
3. If `CustomerHeader.tsx` (desktop header) is visible on tablet-sized mobile viewports (where `useDeviceKind()` may return `"desktop"`), ensure its logo also routes to `tenantPath("print-centre")` instead of `originUrl` when the viewport is narrow.

Scope: one or two files, tiny surgical change. No new dependencies.