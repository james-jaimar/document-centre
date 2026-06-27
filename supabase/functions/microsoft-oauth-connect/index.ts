// Microsoft 365 / Outlook OAuth connect flow for tenant email accounts.
// Mirrors gmail-oauth-connect — single multi-tenant Azure AD app, delegated
// OAuth (authorization_code + refresh_token) so every tenant grants consent
// once and we store the refresh token in Vault.
//
// Actions:
//   - authorize     (POST JSON)  -> returns Microsoft consent URL
//   - disconnect    (POST JSON)  -> removes the account + Vault secret
//   - GET ?code&state            -> consent redirect from Microsoft; finishes
//                                    the exchange and returns an HTML page
//                                    that postMessage's the opener + closes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Authority. `common` allows work + school + personal MSAs. Switch to
// `organizations` if you ever want to lock out personal accounts.
const AUTHORITY = "https://login.microsoftonline.com/common";
// Microsoft's documented delegated Graph scope strings. Use the SAME string
// for authorize, code exchange, and refresh. Do not get clever with
// fully-qualified resource URIs — Microsoft's own examples use the short form.
const SCOPES = "offline_access Mail.Send User.Read";

// Non-secret fingerprint of the OAuth client ID so we can prove the Edge
// Function and the Cloud Run worker are using the SAME Entra app without
// exposing the client_id itself in logs/UI.
async function clientIdFingerprint(clientId: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientId));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8);
}

async function assertAuthorized(
  admin: any,
  callerId: string,
  tenantId: string | null,
  branchId: string | null,
): Promise<boolean> {
  // Platform admins always allowed (and required when tenantId is null).
  const { data: pa } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "platform_admin")
    .maybeSingle();
  if (pa) return true;
  if (!tenantId) return false; // platform-scope connect requires platform_admin
  const { data: tm } = await admin
    .from("tenant_memberships")
    .select("role, branch_id")
    .eq("profile_id", callerId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (!tm || tm.length === 0) return false;
  const isTenantAdmin = tm.some(
    (m: any) => m.branch_id === null && ["owner", "admin"].includes(m.role),
  );
  if (isTenantAdmin) return true;
  if (branchId) {
    return tm.some(
      (m: any) => m.branch_id === branchId && ["owner", "admin", "branch_manager"].includes(m.role),
    );
  }
  return false;
}


// Supabase Edge Functions rewrite text/html GET responses to text/plain
// (documented behaviour), which is why our self-rendered close page showed
// as raw source. Redirect to a normal React route in the app instead — it
// renders the result UI and postMessages the opener before closing.
function redirectToCallbackResult(
  origin: string,
  payload: Record<string, unknown>,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const target = `${origin}/oauth/microsoft/callback-result?${params.toString()}`;
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: target },
  });
}

// Derive the SPA origin to redirect back to. Prefer the Origin/Referer header
// (the popup was opened from the dashboard); fall back to the configured
// public app URL secret.
function resolveAppOrigin(req: Request): string {
  const ref = req.headers.get("referer");
  if (ref) {
    try { return new URL(ref).origin; } catch { /* ignore */ }
  }
  const origin = req.headers.get("origin");
  if (origin) return origin;
  return Deno.env.get("PUBLIC_APP_URL") || "https://document-centre.com";
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_OAUTH_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return json(
      {
        error:
          "Microsoft OAuth not configured. Platform admin must add MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET.",
      },
      503,
    );
  }

  const functionUrl = `${url}/functions/v1/microsoft-oauth-connect`;
  const admin = createClient(url, serviceKey);

  // ── GET: Microsoft consent redirect ──
  if (req.method === "GET") {
    // Default redirect origin if state is missing/broken.
    let appOrigin = resolveAppOrigin(req);
    const fail = (err: string) =>
      redirectToCallbackResult(appOrigin, { success: "false", error: err });
    try {
      const reqUrl = new URL(req.url);
      const code = reqUrl.searchParams.get("code");
      const stateRaw = reqUrl.searchParams.get("state");
      const oauthErr = reqUrl.searchParams.get("error_description") || reqUrl.searchParams.get("error");
      if (oauthErr) return fail(oauthErr);
      if (!code || !stateRaw) return fail("Missing code or state");

      let state: { tenant_id: string | null; caller_id: string; branch_id?: string | null; scope?: "tenant" | "platform"; origin?: string };
      try {
        state = JSON.parse(atob(stateRaw));
      } catch {
        return fail("Invalid state");
      }
      if (state.origin) appOrigin = state.origin;
      const branchId = state.branch_id ?? null;
      const isPlatform = state.scope === "platform" || state.tenant_id === null;
      const tenantId = isPlatform ? null : state.tenant_id;

      if (!(await assertAuthorized(admin, state.caller_id, tenantId, branchId))) {
        return fail("Forbidden");
      }

      const tokenRes = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: functionUrl,
          grant_type: "authorization_code",
          scope: SCOPES,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.refresh_token) {
        const fp = await clientIdFingerprint(clientId);
        console.error("Microsoft token exchange failed (client_fp=" + fp + "):", tokenData);
        return fail(tokenData.error_description || "Token exchange failed");
      }

      // Lookup mailbox address.
      let mailbox = "";
      let displayName = "";
      try {
        const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const me = await meRes.json();
        mailbox = me.mail || me.userPrincipalName || "";
        displayName = me.displayName || "";
      } catch {
        // fall through
      }
      if (!mailbox) {
        return fail("Could not determine mailbox address");
      }

      const secretName = `graph_oauth:${isPlatform ? "platform" : tenantId}:${crypto.randomUUID()}`;
      const { data: secretId, error: vErr } = await admin.rpc("create_email_account_secret", {
        p_name: secretName,
        p_secret: tokenData.refresh_token,
      });
      if (vErr) return fail(`Vault error: ${vErr.message}`);

      let existingQuery = admin
        .from("email_accounts")
        .select("id, oauth_refresh_token_secret_id")
        .eq("transport", "graph_oauth");
      existingQuery = isPlatform
        ? existingQuery.is("tenant_id", null).is("branch_id", null)
        : (branchId
            ? existingQuery.eq("tenant_id", tenantId!).eq("branch_id", branchId)
            : existingQuery.eq("tenant_id", tenantId!).is("branch_id", null));
      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        if (existing.oauth_refresh_token_secret_id) {
          await admin.rpc("delete_email_account_secret", {
            p_secret_id: existing.oauth_refresh_token_secret_id,
          });
        }
        const { error } = await admin
          .from("email_accounts")
          .update({
            oauth_refresh_token_secret_id: secretId,
            oauth_email: mailbox,
            from_email: mailbox,
            from_name: displayName || mailbox.split("@")[0],
            last_verified_at: new Date().toISOString(),
            last_error: null,
            is_active: true,
          })
          .eq("id", existing.id);
        if (error) return fail(error.message);
      } else {
        const label = isPlatform
          ? "Document Centre Platform"
          : (branchId ? "Microsoft 365 (Branch)" : "Microsoft 365");
        const { error } = await admin.from("email_accounts").insert({
          tenant_id: tenantId,
          branch_id: branchId,
          transport: "graph_oauth",
          label,
          from_name: displayName || mailbox.split("@")[0],
          from_email: mailbox,
          oauth_refresh_token_secret_id: secretId,
          oauth_email: mailbox,
          is_active: true,
          is_default: isPlatform ? true : !!branchId,
          last_verified_at: new Date().toISOString(),
        });
        if (error) return fail(error.message);
      }

      const fp = await clientIdFingerprint(clientId);
      console.log(`microsoft-oauth-connect: connected ${mailbox} (client_fp=${fp})`);
      return redirectToCallbackResult(appOrigin, { success: "true", email: mailbox });

    } catch (e) {
      console.error("microsoft-oauth-connect GET error:", e);
      return fail((e as Error).message);
    }
  }


  // ── POST: authorize / disconnect ──
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const action = body.action as string;

    if (action === "authorize") {
      const scope = (body.scope as string | undefined) === "platform" ? "platform" : "tenant";
      const isPlatform = scope === "platform";
      const tenantId = isPlatform ? null : (body.tenant_id as string);
      const branchId = (body.branch_id as string | undefined) || null;
      if (!isPlatform && !tenantId) return json({ error: "tenant_id required" }, 400);
      if (!(await assertAuthorized(admin, caller.id, tenantId, branchId))) {
        return json({ error: "Forbidden" }, 403);
      }

      // Capture the SPA origin so the callback redirect lands back on the
      // same host the popup was opened from (preview, custom domain, etc).
      const reqOrigin = req.headers.get("origin") || resolveAppOrigin(req);
      const state = btoa(
        JSON.stringify({ tenant_id: tenantId, caller_id: caller.id, branch_id: branchId, scope, origin: reqOrigin }),
      );
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: functionUrl,
        response_mode: "query",
        scope: SCOPES,
        state,
        prompt: "consent",
      });
      return json({ authorize_url: `${AUTHORITY}/oauth2/v2.0/authorize?${params}` });
    }


    if (action === "disconnect") {
      const accountId = body.account_id as string;
      if (!accountId) return json({ error: "account_id required" }, 400);

      const { data: acct } = await admin
        .from("email_accounts")
        .select("*")
        .eq("id", accountId)
        .eq("transport", "graph_oauth")
        .maybeSingle();

      if (!acct) return json({ error: "Not found" }, 404);
      if (!(await assertAuthorized(admin, caller.id, acct.tenant_id, acct.branch_id))) {
        return json({ error: "Forbidden" }, 403);
      }

      if (acct.oauth_refresh_token_secret_id) {
        await admin.rpc("delete_email_account_secret", {
          p_secret_id: acct.oauth_refresh_token_secret_id,
        });
      }
      await admin.from("email_accounts").delete().eq("id", accountId);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("microsoft-oauth-connect error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
