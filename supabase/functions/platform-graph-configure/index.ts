// Configure the platform-scoped Microsoft Graph sender mailbox using
// app-only (client_credentials) auth. This is the recommended Microsoft path
// for service mailboxes: no refresh tokens, no AADSTS90013, no re-consent.
//
// Reads tenant_id / client_id / client_secret from edge function secrets
// (MICROSOFT_GRAPH_TENANT_ID / MICROSOFT_GRAPH_CLIENT_ID /
// MICROSOFT_GRAPH_CLIENT_SECRET) so they never round-trip through the browser.
//
// Actions:
//   provision { sender_address?: string, label?: string }
//     → stores client_secret in Vault, upserts a single platform row
//       (tenant_id=null, branch_id=null, transport='graph', is_default=true),
//       and deactivates any older platform graph_oauth row pointing at the
//       same mailbox.
//   status   → returns the current platform graph row (if any) and whether
//              the three env-var secrets are present.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function isPlatformAdmin(admin: any, callerId: string) {
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "platform_admin")
    .maybeSingle();
  return !!data;
}

// Hit Microsoft's token endpoint to fail-fast if creds are wrong.
async function verifyAppOnlyToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
        }),
      },
    );
    if (!r.ok) {
      const body = await r.text();
      return { ok: false, error: `token ${r.status}: ${body.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `network: ${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const tenantId = Deno.env.get("MICROSOFT_GRAPH_TENANT_ID");
    const clientId = Deno.env.get("MICROSOFT_GRAPH_CLIENT_ID");
    const clientSecret = Deno.env.get("MICROSOFT_GRAPH_CLIENT_SECRET");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    if (!(await isPlatformAdmin(admin, caller.id))) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({})) as {
      action?: string;
      sender_address?: string;
      label?: string;
    };

    if (body.action === "status") {
      const { data: row } = await admin
        .from("email_accounts")
        .select("id,from_email,graph_sender_address,graph_tenant_id,graph_client_id,is_active,is_default,last_error,last_verified_at,label")
        .is("tenant_id", null)
        .is("branch_id", null)
        .eq("transport", "graph")
        .maybeSingle();
      return json({
        secrets_present: {
          tenant_id: !!tenantId,
          client_id: !!clientId,
          client_secret: !!clientSecret,
        },
        account: row ?? null,
      });
    }

    if (body.action !== "provision") return json({ error: "unknown_action" }, 400);

    if (!tenantId || !clientId || !clientSecret) {
      return json({
        error:
          "Microsoft Graph platform secrets missing. Add MICROSOFT_GRAPH_TENANT_ID, MICROSOFT_GRAPH_CLIENT_ID, MICROSOFT_GRAPH_CLIENT_SECRET in edge function secrets first.",
      }, 400);
    }

    const sender = (body.sender_address || "hello@document-centre.com").trim().toLowerCase();
    const label = body.label || "Document Centre Platform (Graph app-only)";

    // 1. Verify the creds actually work against Microsoft before persisting.
    const verify = await verifyAppOnlyToken(tenantId, clientId, clientSecret);
    if (!verify.ok) {
      return json({
        error: `Microsoft rejected app-only token: ${verify.error}. Double-check tenant id, client id, client secret value (not secret id), and that admin consent was granted for Mail.Send.`,
      }, 400);
    }

    // 2. Look up existing platform graph row (we keep at most one).
    const { data: existing } = await admin
      .from("email_accounts")
      .select("id, graph_client_secret_id")
      .is("tenant_id", null)
      .is("branch_id", null)
      .eq("transport", "graph")
      .maybeSingle();

    // 3. Store the client secret in vault; rotate the previous one if any.
    const secretName = `email_account:platform-graph:${crypto.randomUUID()}`;
    const { data: secretId, error: vErr } = await admin.rpc("create_email_account_secret", {
      p_name: secretName,
      p_secret: clientSecret,
    });
    if (vErr) return json({ error: `vault: ${vErr.message}` }, 500);

    if (existing?.graph_client_secret_id) {
      await admin.rpc("delete_email_account_secret", {
        p_secret_id: existing.graph_client_secret_id,
      });
    }

    const row = {
      tenant_id: null,
      branch_id: null,
      transport: "graph",
      label,
      from_name: "Document Centre",
      from_email: sender,
      reply_to: null,
      graph_tenant_id: tenantId,
      graph_client_id: clientId,
      graph_client_secret_id: secretId as string,
      graph_sender_address: sender,
      is_default: true,
      is_active: true,
      last_error: null,
      last_verified_at: new Date().toISOString(),
    };

    // 4. Demote other platform defaults so there is exactly one.
    await admin
      .from("email_accounts")
      .update({ is_default: false })
      .is("tenant_id", null)
      .is("branch_id", null);

    // 5. Upsert.
    let savedId: string;
    if (existing) {
      const { data, error } = await admin
        .from("email_accounts")
        .update(row)
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 500);
      savedId = data.id;
    } else {
      const { data, error } = await admin
        .from("email_accounts")
        .insert(row)
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 500);
      savedId = data.id;
    }

    // 6. Deactivate any platform graph_oauth row pointing at same mailbox
    //    so the worker stops trying to refresh its dead token.
    await admin
      .from("email_accounts")
      .update({ is_active: false, is_default: false, last_error: "Replaced by app-only Graph mailbox" })
      .is("tenant_id", null)
      .is("branch_id", null)
      .eq("transport", "graph_oauth");

    return json({ success: true, account_id: savedId, sender_address: sender });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
