// Gmail OAuth connect flow for tenant email accounts.
// Actions:
//   - authorize: returns Google OAuth consent URL
//   - callback: exchanges auth code for tokens, stores refresh token in Vault
//   - disconnect: removes OAuth tokens and resets the email account
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

async function assertAuthorized(
  admin: any,
  callerId: string,
  tenantId: string,
  branchId: string | null,
): Promise<boolean> {
  const { data: pa } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "platform_admin")
    .maybeSingle();
  if (pa) return true;
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
      (m: any) => m.branch_id === branchId && ["owner", "admin", "manager"].includes(m.role),
    );
  }
  return false;
}

function htmlClosePage(corsHdrs: Record<string, string>, payload: Record<string, unknown>) {
  const safe = JSON.stringify({ type: "gmail-oauth-callback", ...payload })
    .replace(/</g, "\\u003c");
  const body = `<!doctype html>
<html><head><meta charset="utf-8"><title>Gmail Connect</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#333}</style>
</head><body>
<p>Gmail account connected. You can close this window.</p>
<script>
  try {
    var payload = ${safe};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, "*");
    }
  } catch (e) {}
  setTimeout(function(){ window.close(); }, 300);
</script>
</body></html>`;
  return new Response(body, {
    status: 200,
    headers: { ...corsHdrs, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GMAIL_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GMAIL_OAUTH_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return json({ error: "Gmail OAuth not configured. Platform admin must add GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET." }, 503);
    }

    const admin = createClient(url, serviceKey);
    // The callback URL for the OAuth flow — points back to this function
    const functionUrl = `${url}/functions/v1/gmail-oauth-connect`;

    // ── GET: Google consent redirect (?code=&state=) ──
    if (req.method === "GET") {
      const reqUrl = new URL(req.url);
      const code = reqUrl.searchParams.get("code");
      const stateRaw = reqUrl.searchParams.get("state");
      const oauthErr = reqUrl.searchParams.get("error_description") || reqUrl.searchParams.get("error");
      if (oauthErr) return htmlClosePage(corsHeaders, { success: false, error: oauthErr });
      if (!code || !stateRaw) return htmlClosePage(corsHeaders, { success: false, error: "Missing code or state" });

      let state: { tenant_id: string; caller_id: string; branch_id?: string | null };
      try {
        state = JSON.parse(atob(stateRaw));
      } catch {
        return htmlClosePage(corsHeaders, { success: false, error: "Invalid state" });
      }
      const branchId = state.branch_id ?? null;
      if (!(await assertAuthorized(admin, state.caller_id, state.tenant_id, branchId))) {
        return htmlClosePage(corsHeaders, { success: false, error: "Forbidden" });
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: functionUrl,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.refresh_token) {
        console.error("Gmail token exchange failed:", tokenData);
        return htmlClosePage(corsHeaders, {
          success: false,
          error: tokenData.error_description || "Failed to exchange code for tokens",
        });
      }

      let gmailEmail = "";
      try {
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userinfo = await userinfoRes.json();
        gmailEmail = userinfo.email || "";
      } catch {
        gmailEmail = "";
      }
      if (!gmailEmail) return htmlClosePage(corsHeaders, { success: false, error: "Could not determine Gmail address" });

      const secretName = `gmail_oauth:${state.tenant_id}:${crypto.randomUUID()}`;
      const { data: secretId, error: vErr } = await admin.rpc("create_email_account_secret", {
        p_name: secretName,
        p_secret: tokenData.refresh_token,
      });
      if (vErr) return htmlClosePage(corsHeaders, { success: false, error: `Vault error: ${vErr.message}` });

      let existingQuery = admin
        .from("email_accounts")
        .select("id, oauth_refresh_token_secret_id")
        .eq("tenant_id", state.tenant_id)
        .eq("transport", "gmail_oauth");
      existingQuery = branchId
        ? existingQuery.eq("branch_id", branchId)
        : existingQuery.is("branch_id", null);
      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        if (existing.oauth_refresh_token_secret_id) {
          await admin.rpc("delete_email_account_secret", { p_secret_id: existing.oauth_refresh_token_secret_id });
        }
        const { error } = await admin
          .from("email_accounts")
          .update({
            oauth_refresh_token_secret_id: secretId,
            oauth_email: gmailEmail,
            from_email: gmailEmail,
            from_name: gmailEmail.split("@")[0],
            last_verified_at: new Date().toISOString(),
            last_error: null,
            is_active: true,
          })
          .eq("id", existing.id);
        if (error) return htmlClosePage(corsHeaders, { success: false, error: error.message });
      } else {
        const { error } = await admin.from("email_accounts").insert({
          tenant_id: state.tenant_id,
          branch_id: branchId,
          transport: "gmail_oauth",
          label: branchId ? "Gmail (Branch)" : "Gmail",
          from_name: gmailEmail.split("@")[0],
          from_email: gmailEmail,
          oauth_refresh_token_secret_id: secretId,
          oauth_email: gmailEmail,
          is_active: true,
          is_default: !!branchId,
          last_verified_at: new Date().toISOString(),
        });
        if (error) return htmlClosePage(corsHeaders, { success: false, error: error.message });
      }

      return htmlClosePage(corsHeaders, { success: true, email: gmailEmail });
    }

    // ── POST: authorize / disconnect / (legacy callback) ──
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
      const tenantId = body.tenant_id as string;
      const branchId = (body.branch_id as string | undefined) || null;
      if (!tenantId) return json({ error: "tenant_id required" }, 400);
      if (!(await assertAuthorized(admin, caller.id, tenantId, branchId))) {
        return json({ error: "Forbidden" }, 403);
      }

      const state = btoa(
        JSON.stringify({ tenant_id: tenantId, caller_id: caller.id, branch_id: branchId }),
      );

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: functionUrl,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/gmail.send email profile",
        access_type: "offline",
        prompt: "consent",
        state,
      });

      return json({ authorize_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }

    if (action === "disconnect") {
      const accountId = body.account_id as string;
      if (!accountId) return json({ error: "account_id required" }, 400);

      const { data: acct } = await admin
        .from("email_accounts")
        .select("*")
        .eq("id", accountId)
        .eq("transport", "gmail_oauth")
        .maybeSingle();

      if (!acct) return json({ error: "Not found" }, 404);
      if (!(await assertAuthorized(admin, caller.id, acct.tenant_id, acct.branch_id))) {
        return json({ error: "Forbidden" }, 403);
      }

      if (acct.oauth_refresh_token_secret_id) {
        await admin.rpc("delete_email_account_secret", { p_secret_id: acct.oauth_refresh_token_secret_id });
      }

      await admin.from("email_accounts").delete().eq("id", accountId);

      return json({ success: true });
    }


    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("gmail-oauth-connect error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
