// Tenant-scoped CRUD wrapper for SMTP accounts.
// - Stores the SMTP password in Supabase Vault and persists only the secret_id.
// - Tenant owners/admins call this from the Email Accounts settings UI.
// - Actions: upsert | delete | get_password (mask) | test_send
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
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

interface UpsertBody {
  action: "upsert";
  id?: string | null;
  tenant_id: string;
  branch_id?: string | null;
  label: string;
  from_name: string;
  from_email: string;
  reply_to?: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: "tls" | "starttls" | "none";
  smtp_username: string;
  smtp_password?: string | null; // optional on update
  is_default?: boolean;
  is_active?: boolean;
}

interface DeleteBody { action: "delete"; id: string; }
interface TestBody { action: "test_send"; id: string; recipient: string; }
interface DisconnectGmailBody { action: "disconnect_gmail"; id: string; }

type Body = UpsertBody | DeleteBody | TestBody | DisconnectGmailBody;

async function assertTenantAdmin(admin: any, callerId: string, tenant_id: string) {
  const { data } = await admin
    .from("tenant_memberships")
    .select("role")
    .eq("profile_id", callerId)
    .eq("tenant_id", tenant_id)
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

/** True if caller is platform admin, tenant owner/admin, or active branch_manager of `branch_id`. */
async function assertCanManageBranchOrTenant(
  admin: any,
  callerId: string,
  tenant_id: string,
  branch_id: string | null
) {
  if (await assertTenantAdmin(admin, callerId, tenant_id)) return true;
  if (!branch_id) return false;
  const { data } = await admin
    .from("tenant_memberships")
    .select("id")
    .eq("profile_id", callerId)
    .eq("tenant_id", tenant_id)
    .eq("branch_id", branch_id)
    .eq("role", "branch_manager")
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const body = (await req.json()) as Body;

    if (body.action === "upsert") {
      if (!(await assertCanManageBranchOrTenant(admin, caller.id, body.tenant_id, body.branch_id ?? null))) return json({ error: "Forbidden" }, 403);


      let secret_id: string | null = null;

      // Resolve existing row to keep prior secret if password not supplied
      let existing: any = null;
      if (body.id) {
        const { data } = await admin.from("email_accounts").select("*").eq("id", body.id).maybeSingle();
        existing = data;
      }

      if (body.smtp_password) {
        const secretName = `email_account:${body.tenant_id}:${crypto.randomUUID()}`;
        const { data: created, error: vErr } = await admin.rpc("create_email_account_secret", {
          p_name: secretName,
          p_secret: body.smtp_password,
        });
        if (vErr) return json({ error: `vault: ${vErr.message}` }, 500);
        secret_id = created as string;

        // Best-effort cleanup of previous secret
        if (existing?.smtp_password_secret_id) {
          await admin.rpc("delete_email_account_secret", { p_secret_id: existing.smtp_password_secret_id });
        }
      } else {
        secret_id = existing?.smtp_password_secret_id ?? null;
      }

      const row = {
        tenant_id: body.tenant_id,
        branch_id: body.branch_id ?? null,
        label: body.label,
        from_name: body.from_name,
        from_email: body.from_email,
        reply_to: body.reply_to ?? null,
        smtp_host: body.smtp_host,
        smtp_port: body.smtp_port,
        smtp_secure: body.smtp_secure,
        smtp_username: body.smtp_username,
        smtp_password_secret_id: secret_id,
        is_default: body.is_default ?? false,
        is_active: body.is_active ?? true,
      };

      // Maintain single-default invariant
      if (row.is_default) {
        const builder = admin
          .from("email_accounts")
          .update({ is_default: false })
          .eq("tenant_id", body.tenant_id);
        if (body.branch_id) {
          await builder.eq("branch_id", body.branch_id);
        } else {
          await builder.is("branch_id", null);
        }
      }

      if (body.id) {
        const { data, error } = await admin
          .from("email_accounts")
          .update(row)
          .eq("id", body.id)
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, account: data });
      }
      const { data, error } = await admin.from("email_accounts").insert(row).select("*").single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, account: data });
    }

    if (body.action === "delete") {
      const { data: acct } = await admin.from("email_accounts").select("*").eq("id", body.id).maybeSingle();
      if (!acct) return json({ error: "Not found" }, 404);
      if (!(await assertCanManageBranchOrTenant(admin, caller.id, acct.tenant_id, acct.branch_id))) return json({ error: "Forbidden" }, 403);

      if (acct.smtp_password_secret_id) {
        await admin.rpc("delete_email_account_secret", { p_secret_id: acct.smtp_password_secret_id });
      }
      const { error } = await admin.from("email_accounts").delete().eq("id", body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (body.action === "test_send") {
      const { data: acct } = await admin.from("email_accounts").select("*").eq("id", body.id).maybeSingle();
      if (!acct) return json({ error: "Not found" }, 404);
      if (!(await assertCanManageBranchOrTenant(admin, caller.id, acct.tenant_id, acct.branch_id))) return json({ error: "Forbidden" }, 403);


      const { data: pwd, error: pwdErr } = await admin.rpc("read_email_account_secret", {
        p_secret_id: acct.smtp_password_secret_id,
      });
      if (pwdErr || !pwd) return json({ error: "Could not read SMTP password" }, 500);

      const client = new SMTPClient({
        connection: {
          hostname: acct.smtp_host,
          port: acct.smtp_port,
          tls: acct.smtp_secure === "tls",
          auth: { username: acct.smtp_username, password: pwd as string },
        },
      });

      try {
        await client.send({
          from: `${acct.from_name} <${acct.from_email}>`,
          to: body.recipient,
          subject: `Test from ${acct.label}`,
          content: `This is a test email from your "${acct.label}" SMTP account.\n\nIf you received this, the configuration is working.`,
        });
        await client.close();
        await admin
          .from("email_accounts")
          .update({ last_verified_at: new Date().toISOString(), last_error: null })
          .eq("id", acct.id);
        return json({ success: true });
      } catch (e) {
        const msg = (e as Error).message;
        await admin.from("email_accounts").update({ last_error: msg.slice(0, 500) }).eq("id", acct.id);
        return json({ error: msg }, 500);
      }
    }

    if (body.action === "disconnect_gmail") {
      const { data: acct } = await admin.from("email_accounts").select("*").eq("id", body.id).maybeSingle();
      if (!acct) return json({ error: "Not found" }, 404);
      if (!(await assertCanManageBranchOrTenant(admin, caller.id, acct.tenant_id, acct.branch_id))) return json({ error: "Forbidden" }, 403);

      if (acct.transport !== "gmail_oauth") return json({ error: "Account is not Gmail OAuth" }, 400);
      if (acct.oauth_refresh_token_secret_id) {
        await admin.rpc("delete_email_account_secret", { p_secret_id: acct.oauth_refresh_token_secret_id });
      }
      const { error } = await admin.from("email_accounts").delete().eq("id", body.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("email-account-manage error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
