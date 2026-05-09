// Tenant or branch admin saves provider credentials (stored in Vault).
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, userClient, adminClient, writeSecret, deleteSecret } from "../_shared/payments.ts";

const SaveSchema = z.object({
  scope: z.enum(["tenant", "branch"]),
  scope_id: z.string().uuid(),
  provider: z.enum(["stripe", "payfast"]),
  mode: z.enum(["test", "live"]),
  display_label: z.string().max(120).optional(),
  // Stripe
  secret_key: z.string().optional(),
  publishable_key: z.string().optional(),
  webhook_secret: z.string().optional(),
  // PayFast
  merchant_id: z.string().optional(),
  merchant_key: z.string().optional(),
  passphrase: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const sbUser = userClient(authHeader);
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const parsed = SaveSchema.safeParse(await req.json().catch(() => ({})));
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

  // Permission: platform admin OR tenant owner/admin
  const { data: roleRow } = await sb.from("user_roles")
    .select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle();
  const isPlatformAdmin = !!roleRow;

  if (!isPlatformAdmin) {
    const { data: m } = await sb.from("tenant_memberships")
      .select("role").eq("profile_id", user.id).eq("tenant_id", tenantId).eq("is_active", true)
      .in("role", ["owner", "admin"]).maybeSingle();
    if (!m) return json({ error: "Forbidden" }, 403);
  }

  const credBlob: Record<string, string> = {};
  if (body.provider === "stripe") {
    if (body.secret_key) credBlob.secret_key = body.secret_key;
    if (body.publishable_key) credBlob.publishable_key = body.publishable_key;
    if (body.webhook_secret) credBlob.webhook_secret = body.webhook_secret;
  } else {
    if (body.merchant_id) credBlob.merchant_id = body.merchant_id;
    if (body.merchant_key) credBlob.merchant_key = body.merchant_key;
    if (body.passphrase !== undefined) credBlob.passphrase = body.passphrase;
  }

  const table = body.scope === "tenant" ? "tenant_payment_gateways" : "branch_payment_gateways";
  const matchCol = body.scope === "tenant" ? "tenant_id" : "branch_id";

  const { data: existing } = await sb.from(table)
    .select("id, credentials_secret_id")
    .eq(matchCol, body.scope_id).eq("provider", body.provider).maybeSingle();

  // Merge with existing creds so partial updates don't blow away other fields
  let merged = credBlob;
  if (existing?.credentials_secret_id) {
    const { data: existingSecret } = await sb.rpc("read_payment_secret", { p_secret_id: existing.credentials_secret_id });
    try {
      const prev = existingSecret ? JSON.parse(existingSecret as string) : {};
      merged = { ...prev, ...credBlob };
    } catch { /* ignore */ }
  }

  let secretId = existing?.credentials_secret_id ?? null;
  if (Object.keys(merged).length > 0) {
    if (secretId) {
      await deleteSecret(secretId);
    }
    secretId = await writeSecret(`payments_${body.provider}_${body.scope}_${body.scope_id}`, merged);
  }

  if (existing) {
    const updates: Record<string, unknown> = { credentials_secret_id: secretId, mode: body.mode };
    if (body.scope === "tenant" && body.display_label !== undefined) updates.display_label = body.display_label;
    await sb.from(table).update(updates).eq("id", existing.id);
  } else {
    const insert: Record<string, unknown> = {
      [matchCol]: body.scope_id,
      provider: body.provider,
      credentials_secret_id: secretId,
      mode: body.mode,
    };
    if (body.scope === "tenant" && body.display_label !== undefined) insert.display_label = body.display_label;
    await sb.from(table).insert(insert);
  }

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
