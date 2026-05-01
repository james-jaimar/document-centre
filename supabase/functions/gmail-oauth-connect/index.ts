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

async function assertTenantAdmin(admin: any, callerId: string, tenantId: string): Promise<boolean> {
  const { data } = await admin
    .from("tenant_memberships")
    .select("role")
    .eq("profile_id", callerId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (data) return true;
  const { data: pa } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "platform_admin")
    .maybeSingle();
  return !!pa;
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const body = await req.json();
    const action = body.action as string;

    // The callback URL for the OAuth flow — points back to this function
    const functionUrl = `${url}/functions/v1/gmail-oauth-connect`;

    if (action === "authorize") {
      const tenantId = body.tenant_id as string;
      if (!tenantId) return json({ error: "tenant_id required" }, 400);
      if (!(await assertTenantAdmin(admin, caller.id, tenantId))) return json({ error: "Forbidden" }, 403);

      // Build state payload (tenant_id + caller_id for the callback)
      const state = btoa(JSON.stringify({ tenant_id: tenantId, caller_id: caller.id }));

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

    // Handle the GET callback from Google (browser redirect)
    if (action === "callback") {
      const code = body.code as string;
      const stateRaw = body.state as string;
      if (!code || !stateRaw) return json({ error: "Missing code or state" }, 400);

      let state: { tenant_id: string; caller_id: string };
      try {
        state = JSON.parse(atob(stateRaw));
      } catch {
        return json({ error: "Invalid state" }, 400);
      }

      if (!(await assertTenantAdmin(admin, state.caller_id, state.tenant_id))) {
        return json({ error: "Forbidden" }, 403);
      }

      // Exchange code for tokens
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
        return json({ error: "Failed to exchange code for tokens", detail: tokenData.error_description }, 400);
      }

      // Get the user's email from the id_token or userinfo
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

      if (!gmailEmail) {
        return json({ error: "Could not determine Gmail address" }, 400);
      }

      // Store refresh token in Vault
      const secretName = `gmail_oauth:${state.tenant_id}:${crypto.randomUUID()}`;
      const { data: secretId, error: vErr } = await admin.rpc("create_email_account_secret", {
        p_name: secretName,
        p_secret: tokenData.refresh_token,
      });
      if (vErr) return json({ error: `Vault error: ${vErr.message}` }, 500);

      // Check for existing gmail_oauth account for this tenant
      const { data: existing } = await admin
        .from("email_accounts")
        .select("id, oauth_refresh_token_secret_id")
        .eq("tenant_id", state.tenant_id)
        .eq("transport", "gmail_oauth")
        .maybeSingle();

      if (existing) {
        // Clean up old refresh token
        if (existing.oauth_refresh_token_secret_id) {
          await admin.rpc("delete_email_account_secret", { p_secret_id: existing.oauth_refresh_token_secret_id });
        }
        // Update existing account
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
        if (error) return json({ error: error.message }, 500);
      } else {
        // Create new account
        const { error } = await admin.from("email_accounts").insert({
          tenant_id: state.tenant_id,
          transport: "gmail_oauth",
          label: "Gmail",
          from_name: gmailEmail.split("@")[0],
          from_email: gmailEmail,
          oauth_refresh_token_secret_id: secretId,
          oauth_email: gmailEmail,
          is_active: true,
          last_verified_at: new Date().toISOString(),
        });
        if (error) return json({ error: error.message }, 500);
      }

      return json({ success: true, email: gmailEmail });
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
      if (!(await assertTenantAdmin(admin, caller.id, acct.tenant_id))) return json({ error: "Forbidden" }, 403);

      // Clean up Vault secret
      if (acct.oauth_refresh_token_secret_id) {
        await admin.rpc("delete_email_account_secret", { p_secret_id: acct.oauth_refresh_token_secret_id });
      }

      // Delete the account
      await admin.from("email_accounts").delete().eq("id", accountId);

      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("gmail-oauth-connect error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
