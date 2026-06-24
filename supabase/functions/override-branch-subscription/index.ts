// Platform-admin manual override for branch subscriptions.
// Supports: comp (free pass), extend_grace, force_cancel, reset_trial,
// reopen_storefront, clear_comp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Action =
  | "comp"
  | "clear_comp"
  | "extend_grace"
  | "force_cancel"
  | "reset_trial"
  | "reopen_storefront";

interface Body {
  branch_id?: string;
  action?: Action;
  reason?: string | null;
  days?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const branchId = body.branch_id;
  const action = body.action;
  const reason = (body.reason ?? "").trim() || null;
  const days = Number.isFinite(body.days) ? Math.max(0, Math.min(3650, Math.floor(body.days!))) : 0;

  if (!branchId || typeof branchId !== "string") return json({ error: "branch_id required" }, 400);
  if (!action) return json({ error: "action required" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Platform admins only.
  const { data: platformRole } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "platform_admin")
    .maybeSingle();
  if (!platformRole) return json({ error: "Forbidden" }, 403);

  const { data: branch } = await sb
    .from("branches")
    .select("id, tenant_id, storefront_closed_at")
    .eq("id", branchId)
    .single();
  if (!branch) return json({ error: "Branch not found" }, 404);

  const { data: existing } = await sb
    .from("branch_subscriptions" as any)
    .select("*")
    .eq("branch_id", branchId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const addDaysIso = (n: number) =>
    new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

  const before: Record<string, unknown> = {
    status: existing?.status ?? null,
    billing_status: existing?.billing_status ?? null,
    trial_status: existing?.trial_status ?? null,
    trial_ends_at: existing?.trial_ends_at ?? null,
    grace_until: existing?.grace_until ?? null,
    comp_until: existing?.comp_until ?? null,
    cancelled_at: existing?.cancelled_at ?? null,
    storefront_closed_at: branch.storefront_closed_at ?? null,
  };

  const patch: Record<string, unknown> = {
    branch_id: branchId,
    tenant_id: branch.tenant_id,
    assigned_by: user.id,
    assigned_at: nowIso,
    override_reason: reason,
  };

  let branchPatch: Record<string, unknown> | null = null;

  switch (action) {
    case "comp": {
      const window = days > 0 ? days : 30;
      patch.comp_until = addDaysIso(window);
      patch.status = "active";
      patch.billing_status = "free";
      patch.cancelled_at = null;
      branchPatch = { storefront_closed_at: null };
      break;
    }
    case "clear_comp": {
      patch.comp_until = null;
      break;
    }
    case "extend_grace": {
      const window = days > 0 ? days : 7;
      patch.grace_until = addDaysIso(window);
      patch.status = "past_due";
      break;
    }
    case "force_cancel": {
      patch.status = "cancelled";
      patch.cancelled_at = nowIso;
      branchPatch = { storefront_closed_at: nowIso };
      break;
    }
    case "reset_trial": {
      const window = days > 0 ? days : 14;
      patch.status = "trialing";
      patch.trial_status = "active";
      patch.trial_started_at = nowIso;
      patch.trial_ends_at = addDaysIso(window);
      patch.cancelled_at = null;
      branchPatch = { storefront_closed_at: null };
      break;
    }
    case "reopen_storefront": {
      branchPatch = { storefront_closed_at: null };
      break;
    }
    default:
      return json({ error: "Unknown action" }, 400);
  }

  const { data: sub, error: subErr } = await sb
    .from("branch_subscriptions" as any)
    .upsert(patch, { onConflict: "branch_id" })
    .select()
    .single();
  if (subErr) return json({ error: subErr.message }, 500);

  if (branchPatch) {
    const { error: brErr } = await sb
      .from("branches")
      .update(branchPatch)
      .eq("id", branchId);
    if (brErr) return json({ error: brErr.message }, 500);
  }

  const after: Record<string, unknown> = {
    status: (sub as any)?.status ?? null,
    billing_status: (sub as any)?.billing_status ?? null,
    trial_status: (sub as any)?.trial_status ?? null,
    trial_ends_at: (sub as any)?.trial_ends_at ?? null,
    grace_until: (sub as any)?.grace_until ?? null,
    comp_until: (sub as any)?.comp_until ?? null,
    cancelled_at: (sub as any)?.cancelled_at ?? null,
    storefront_closed_at: branchPatch?.storefront_closed_at ?? branch.storefront_closed_at ?? null,
  };

  await sb.from("platform_admin_audit" as any).insert({
    actor_user_id: user.id,
    actor_email_snapshot: user.email ?? null,
    action: `subscription.${action}`,
    target_type: "branch_subscription",
    target_id: (sub as any)?.id ?? null,
    tenant_id: branch.tenant_id,
    branch_id: branchId,
    before_state: before,
    after_state: after,
    reason,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  });

  return json({ ok: true, subscription: sub });
});
