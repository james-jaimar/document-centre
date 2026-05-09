// Shared helpers for payment edge functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export function userClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

export async function readSecret(secretId: string): Promise<Record<string, string> | null> {
  const sb = adminClient();
  const { data, error } = await sb.rpc("read_payment_secret", { p_secret_id: secretId });
  if (error || !data) return null;
  try {
    return JSON.parse(data as string);
  } catch {
    return null;
  }
}

export async function writeSecret(name: string, value: Record<string, string>): Promise<string> {
  const sb = adminClient();
  const { data, error } = await sb.rpc("create_payment_secret", {
    p_name: name,
    p_secret: JSON.stringify(value),
  });
  if (error) throw new Error(`create_payment_secret failed: ${error.message}`);
  return data as string;
}

export async function deleteSecret(secretId: string): Promise<void> {
  const sb = adminClient();
  await sb.rpc("delete_payment_secret", { p_secret_id: secretId });
}

export interface ResolvedGateway {
  provider: "stripe" | "payfast";
  mode: "test" | "live";
  secretId: string;
  source: "branch" | "tenant";
  branchId?: string | null;
  displayLabel?: string | null;
}

/** Resolve enabled+configured gateways for an order, applying branch override. */
export async function resolveGatewaysForOrder(orderId: string): Promise<{
  order: any;
  gateways: ResolvedGateway[];
}> {
  const sb = adminClient();
  const { data: order, error: orderErr } = await sb
    .from("orders")
    .select("id, tenant_id, branch_id, app_id, currency, amount_due, total_amount, ordered_by_profile_id, order_number")
    .eq("id", orderId)
    .single();
  if (orderErr || !order) throw new Error("Order not found");

  const { data: tpgs } = await sb
    .from("tenant_payment_gateways")
    .select("provider, is_enabled, mode, credentials_secret_id, display_label")
    .eq("tenant_id", order.tenant_id)
    .eq("is_enabled", true);

  const gateways: ResolvedGateway[] = [];
  for (const t of tpgs ?? []) {
    if (!t.credentials_secret_id) continue;

    let secretId: string = t.credentials_secret_id;
    let mode: "test" | "live" = t.mode;
    let source: "branch" | "tenant" = "tenant";

    if (order.branch_id) {
      const { data: bpg } = await sb
        .from("branch_payment_gateways")
        .select("credentials_secret_id, mode")
        .eq("branch_id", order.branch_id)
        .eq("provider", t.provider)
        .maybeSingle();
      if (bpg?.credentials_secret_id) {
        secretId = bpg.credentials_secret_id;
        mode = bpg.mode;
        source = "branch";
      }
    }

    // Currency filter
    if (t.provider === "payfast" && (order.currency || "ZAR").toUpperCase() !== "ZAR") continue;

    gateways.push({
      provider: t.provider,
      mode,
      secretId,
      source,
      branchId: source === "branch" ? order.branch_id : null,
      displayLabel: t.display_label,
    });
  }

  return { order, gateways };
}
