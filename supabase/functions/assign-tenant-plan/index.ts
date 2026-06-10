import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { platformNotify, tenantOwnerEmails, platformEmailLayout } from "../_shared/platform-notify.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const {
      tenant_id,
      assigned_plan_slug,
      assigned_region_id,
      assigned_discount_type,
      assigned_discount_value,
      assigned_trial_days,
      billing_notes,
    } = body ?? {};

    if (!tenant_id || !assigned_plan_slug) {
      return json({ error: "tenant_id and assigned_plan_slug required" }, 400);
    }

    // Update tenant row (RLS will gate)
    const { error: upErr } = await supabase
      .from("tenants")
      .update({
        assigned_plan_slug,
        assigned_region_id: assigned_region_id ?? null,
        assigned_discount_type: assigned_discount_type ?? null,
        assigned_discount_value: assigned_discount_value ?? null,
        assigned_trial_days: assigned_trial_days ?? null,
        billing_notes: billing_notes ?? null,
      })
      .eq("id", tenant_id);
    if (upErr) return json({ error: upErr.message }, 400);

    // Apply to branches via RPC (security definer + role check inside)
    const { data: count, error: rpcErr } = await supabase.rpc("apply_tenant_plan_to_branches", {
      p_tenant_id: tenant_id,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 400);

    // Fire-and-forget: notify tenant owners that their plan changed.
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenant_id).maybeSingle();
      const recipients = await tenantOwnerEmails(admin, tenant_id);
      await platformNotify(admin, {
        event: "plan_changed",
        recipients,
        tenant_id,
        related_type: "tenant",
        related_id: tenant_id,
        subject: `Your Document Centre plan has been updated`,
        html: platformEmailLayout(
          "Your plan has been updated",
          `<p>The plan for <strong>${tenant?.name ?? "your account"}</strong> has been updated to <strong>${assigned_plan_slug}</strong>.</p>
           ${assigned_trial_days ? `<p>A ${assigned_trial_days}-day trial has been applied.</p>` : ""}
           ${billing_notes ? `<p><em>Notes:</em> ${String(billing_notes).replace(/[<>]/g, "")}</p>` : ""}
           <p>Sign in to review your subscription details.</p>`,
        ),
        text: `Your Document Centre plan has been updated to ${assigned_plan_slug}.`,
      });
    } catch (e) {
      console.error("plan_changed notify failed:", e);
    }

    return json({ ok: true, branches_updated: count ?? 0 });

  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
