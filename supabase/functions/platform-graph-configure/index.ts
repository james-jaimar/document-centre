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

interface GraphDiagnostic {
  ok: boolean;
  stage: "token" | "permission" | "send";
  code: string;
  title: string;
  detail: string;
  steps: string[];
  http_status?: number;
  roles?: string[];
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

function classifyGraphSendFailure(status: number, body: string, roles: string[]): GraphDiagnostic {
  const lower = body.toLowerCase();
  if (!roles.includes("Mail.Send")) {
    return {
      ok: false,
      stage: "permission",
      code: "missing_mail_send_application_role",
      title: "Microsoft issued an app token, but the token does not contain the Mail.Send application role.",
      detail: body.slice(0, 800),
      roles,
      http_status: status,
      steps: [
        "In Entra → App registrations → Doc Centre Mail Sender (GCP) → API permissions, add Microsoft Graph → Application permissions → Mail.Send.",
        "Click Grant admin consent for your tenant and wait a few minutes for Microsoft to issue tokens with the new role.",
        "Delegated Mail.Send does not help this platform mailbox; the token must contain the Application role named Mail.Send.",
      ],
    };
  }
  if (status === 404 || lower.includes("resourcenotfound") || lower.includes("request_resource_not_found")) {
    return {
      ok: false,
      stage: "send",
      code: "mailbox_not_found",
      title: "Microsoft accepted the app permission, but could not find the sender mailbox.",
      detail: body.slice(0, 800),
      roles,
      http_status: status,
      steps: [
        "Confirm hello@document-centre.com is a real Exchange Online user mailbox in this same Microsoft 365 tenant.",
        "Confirm it is not only an alias, shared address without mailbox access, group, or distribution list.",
        "If the mailbox was recently created or licensed, wait for Exchange provisioning to finish and run the diagnostic again.",
      ],
    };
  }
  if (status === 401 || status === 403 || lower.includes("erroraccessdenied")) {
    return {
      ok: false,
      stage: "send",
      code: "exchange_send_denied",
      title: "Microsoft issued a token with Mail.Send, but Exchange blocked this app from sending as hello@document-centre.com.",
      detail: body.slice(0, 800),
      roles,
      http_status: status,
      steps: [
        "In Exchange Online PowerShell, create or verify the application RBAC assignment for this app and the hello@document-centre.com mailbox.",
        "The role assignment must use the Application Mail.Send role, scoped to hello@document-centre.com.",
        "If you previously created an ApplicationAccessPolicy for a different app/client ID, remove or update it so it matches b49ffe95-83b9-44fc-a5ae-36cfd65de84b.",
      ],
    };
  }
  return {
    ok: false,
    stage: "send",
    code: "graph_send_failed",
    title: `Microsoft Graph rejected the send probe with HTTP ${status}.`,
    detail: body.slice(0, 800),
    roles,
    http_status: status,
    steps: ["Review the Microsoft response body, then rerun the diagnostic after correcting the Microsoft 365 configuration."],
  };
}

// Hit Microsoft's token endpoint to fail-fast if creds are wrong.
async function verifyAppOnlyToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ ok: true; token: string; roles: string[] } | { ok: false; diagnostic: GraphDiagnostic }> {
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
      return {
        ok: false,
        diagnostic: {
          ok: false,
          stage: "token",
          code: "token_failed",
          title: "Microsoft rejected the app-only token request.",
          detail: `token ${r.status}: ${body.slice(0, 800)}`,
          http_status: r.status,
          steps: [
            "Check the Directory tenant ID, Application client ID, and client secret VALUE, not the secret ID.",
            "If the secret has expired, create a new client secret and update the platform Graph secret.",
          ],
        },
      };
    }
    const data = await r.json();
    const token = data.access_token as string | undefined;
    if (!token) {
      return {
        ok: false,
        diagnostic: {
          ok: false,
          stage: "token",
          code: "token_missing_access_token",
          title: "Microsoft returned a token response without an access token.",
          detail: JSON.stringify(data).slice(0, 800),
          steps: ["Re-check the app registration credentials and try again."],
        },
      };
    }
    const roles = ((decodeJwtPayload(token).roles as string[] | undefined) ?? []).sort();
    return { ok: true, token, roles };
  } catch (e) {
    return {
      ok: false,
      diagnostic: {
        ok: false,
        stage: "token",
        code: "token_network_error",
        title: "Could not reach Microsoft’s token endpoint.",
        detail: `network: ${(e as Error).message}`,
        steps: ["Try again; if it repeats, check Microsoft service status and network access."],
      },
    };
  }
}

async function runSendDiagnostic(
  token: string,
  roles: string[],
  sender: string,
  recipient: string,
): Promise<GraphDiagnostic> {
  if (!roles.includes("Mail.Send")) {
    return classifyGraphSendFailure(403, "Token roles do not include Mail.Send", roles);
  }
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: "Document Centre Microsoft Graph diagnostic",
        body: {
          contentType: "Text",
          content: `Microsoft Graph diagnostic sent at ${new Date().toISOString()}.`,
        },
        toRecipients: [{ emailAddress: { address: recipient } }],
      },
      saveToSentItems: true,
    }),
  });
  if (r.status === 202) {
    return {
      ok: true,
      stage: "send",
      code: "send_probe_accepted",
      title: "Microsoft Graph accepted a sendMail probe for the platform mailbox.",
      detail: "The app-only token includes Mail.Send and Exchange accepted the sender mailbox.",
      roles,
      http_status: 202,
      steps: [],
    };
  }
  return classifyGraphSendFailure(r.status, await r.text(), roles);
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
      diagnostic_recipient?: string;
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

    if (body.action === "diagnose") {
      if (!tenantId || !clientId || !clientSecret) {
        return json({ error: "Microsoft Graph platform secrets missing." }, 400);
      }
      const sender = (body.sender_address || "hello@document-centre.com").trim().toLowerCase();
      const recipient = (body.diagnostic_recipient || caller.email || sender).trim().toLowerCase();
      const verify = await verifyAppOnlyToken(tenantId, clientId, clientSecret);
      const diagnostic = verify.ok
        ? await runSendDiagnostic(verify.token, verify.roles, sender, recipient)
        : verify.diagnostic;
      await admin
        .from("email_accounts")
        .update({
          last_error: diagnostic.ok ? null : `${diagnostic.code}: ${diagnostic.title} ${diagnostic.detail}`.slice(0, 500),
          last_verified_at: new Date().toISOString(),
        })
        .is("tenant_id", null)
        .is("branch_id", null)
        .eq("transport", "graph");
      return json({ diagnostic });
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
        error: `${verify.diagnostic.code}: ${verify.diagnostic.title} ${verify.diagnostic.detail}`,
        diagnostic: verify.diagnostic,
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
