
The user wants steps 1, 2, and 3 planned and executed. Let me think about this carefully.

**Step 1 — Brand remaining auth emails**
Use the scaffold_auth_email_templates tool. This needs a configured email domain. Need to check if one exists. The project has SMTP secrets (SMTP_HOST etc.) for the existing send-email function, but Lovable's auth email system uses its own domain setup. I'll need to check email_domain status first. If no domain, present the setup dialog. If domain exists, scaffold immediately.

Templates created: signup, magic-link, recovery, invite, email-change, reauthentication. The `invite-member` function we built last turn uses `generateLink({ type: 'recovery' })` and our own SMTP — that flow stays as is (it's already branded). The Lovable auth-email-hook will handle the OTHER auth emails (password reset from `/auth` page, signup confirmation, etc.).

Important: there's potential overlap. The user's existing `/auth` page has a "forgot password" flow that calls `supabase.auth.resetPasswordForEmail()`. That's currently sending Supabase default email. After scaffolding, it'll go through auth-email-hook and use our branded template. Good.

Branding: pull tenant branding. BUT — auth emails happen BEFORE we know which tenant the user belongs to (multi-tenant SaaS). So templates will use the platform-level brand (Document Centre / jaimar.dev), not per-tenant branding. This is a real limitation worth calling out. Per-tenant branded auth emails would require a different architecture (custom flows that bypass Supabase Auth's email system, like the invite flow we built).

Actually wait — for password reset, the user is on a specific tenant storefront when they request it. We could pass tenant context via the redirectTo URL, but the email itself comes from Supabase Auth's webhook which doesn't know tenant context. The auth-email-hook could try to look up the user's tenant_membership and pull branding from there. That's doable. Let me include this.

**Step 2 — Admin Users management page**
Routes:
- `/admin/users` — already exists as AdminUsers.tsx (basic). Need to enhance.
- `/platform/users` — new, lists ALL users across all tenants

Features needed beyond current AdminUsers:
- Search/filter
- Last sign-in timestamp (from auth.users.last_sign_in_at — needs admin API)
- Order count + total spend per user (joins to orders)
- Force password reset (calls our send-email or auth-email-hook)
- Disable/enable account (auth.admin.updateUserById with banned_until)
- Delete account (auth.admin.deleteUser + cascade)
- Resend invite for pending users

Need an edge function: `manage-user` (or extend invite-member) — to perform admin operations using service role. Must validate caller is tenant admin via tenant_memberships.

For platform users page: needs to show users from ALL tenants — only accessible to platform admins. Need to check if there's a platform_admin role or how that works. Looking at memory: "tenant_memberships (Owner, Admin, Sales, Production, Accounts, Customer)" — no explicit platform admin role mentioned, but there's `/platform` routes and `PlatformTenants.tsx`. There must be some platform-level access check.

**Step 3 — OAuth providers (Google, Apple, Microsoft)**
This is mostly configuration in Supabase dashboard, not code. The code side:
- Add "Continue with Google/Apple/Microsoft" buttons to `/auth` page and storefront signup
- Call `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { tenant_slug: ... } } })`
- The `handle_new_user` trigger already reads `raw_user_meta_data->>'tenant_slug'` to attach to the right tenant — but OAuth doesn't pass user_metadata at signup the same way. Need to handle tenant attachment post-OAuth (e.g., a callback page that reads tenant context from URL state and creates the membership).

For the user's planning I should note: the dashboard config requires THEIR action (creating Google Cloud project, getting client ID/secret). I'll do all the code; they do the provider setup in Supabase dashboard.

**Plan structure:**
Keep it concise. 3 phases. Note prerequisites and what the user has to do vs what I do.

Email domain — I should check status. But I'm in plan mode and can call email_domain tools. Let me call get_project_custom_domain to see what's set up before finalizing the plan.

Actually since I'm in plan mode and the rule says "the plan IS your complete response" I shouldn't be making other tool calls now. The plan can include "first I'll check email domain status" as step zero.

Let me write this concisely.
