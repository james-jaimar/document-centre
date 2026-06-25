// Returns the non-secret parts of saved payment credentials so admins can see
// what's actually on file (e.g. PayFast Merchant ID) and verify mode.
// Never returns merchant_key, passphrase, secret_key or webhook_secret in cleartext.
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, userClient, adminClient, readSecret } from "../_shared/payments.ts";

const Schema = z.object({
  scope: z.enum(["tenant", "branch"]),
  scope_id: z.string().uuid(),
  provider: z.enum(["stripe", "payfast"]),
});

function maskTail(value: string | undefined, keep = 4): string | null {
  if (!value) return null;
  if (value.length <= keep) return "•".repeat(value.length);
  return `••••${value.slice(-keep)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const sbUser = userClient(authHeader);
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const body = parsed.data;

  const sb = adminClient();

  // Resolve tenant for permission check
  let tenantId: string;
  if (body.scope === "tenant") {
    tenantId = body.scope_id;
  } else {
    const { data: branch } = await sb.from("branches").select("tenant_id").eq("id", body.scope_id).maybeSingle();
    if (!branch) return json({ error: "Branch not found" }, 404);
    tenantId = branch.tenant_id;
  }

  // Permission: platform admin OR tenant owner/admin OR branch manager of that branch
  const { data: roleRow } = await sb.from("user_roles")
    .select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle();
  const isPlatformAdmin = !!roleRow;

  if (!isPlatformAdmin) {
    const { data: tenantAdmin } = await sb.from("tenant_memberships")
      .select("role").eq("profile_id", user.id).eq("tenant_id", tenantId).eq("is_active", true)
      .in("role", ["owner", "admin"]).maybeSingle();
    let allowed = !!tenantAdmin;
    if (!allowed && body.scope === "branch") {
      const { data: bm } = await sb.from("tenant_memberships")
        .select("id").eq("profile_id", user.id).eq("tenant_id", tenantId)
        .eq("branch_id", body.scope_id).eq("role", "branch_manager").eq("is_active", true).maybeSingle();
      allowed = !!bm;
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);
  }

  // Load the gateway row
  const table = body.scope === "tenant" ? "tenant_payment_gateways" : "branch_payment_gateways";
  const matchCol = body.scope === "tenant" ? "tenant_id" : "branch_id";

  const { data: row } = await sb.from(table)
    .select("credentials_secret_id, mode")
    .eq(matchCol, body.scope_id).eq("provider", body.provider).maybeSingle();

  if (!row?.credentials_secret_id) {
    return json({ configured: false, mode: row?.mode ?? "test" });
  }

  const creds = await readSecret(row.credentials_secret_id);
  if (!creds) return json({ configured: false, mode: row.mode });

  if (body.provider === "payfast") {
    return json({
      configured: true,
      mode: row.mode,
      payfast: {
        merchant_id: creds.merchant_id ?? null,
        merchant_key_mask: maskTail(creds.merchant_key, 4),
        has_passphrase: !!creds.passphrase,
      },
    });
  }

  // Stripe
  return json({
    configured: true,
    mode: row.mode,
    stripe: {
      publishable_key: creds.publishable_key ?? null,
      secret_key_mask: maskTail(creds.secret_key, 4),
      webhook_secret_mask: maskTail(creds.webhook_secret, 4),
    },
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
