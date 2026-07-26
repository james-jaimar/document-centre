// Shared helper: on first live branch activation (trial or paid), flip the
// tenant to live and lift the demo/security gate. Both updates are guarded by
// the current value so they only write once and never fight an admin override.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export async function activateTenantOnFirstLiveBranch(
  sb: SupabaseClient,
  tenantId: string | null | undefined,
  source: string,
): Promise<void> {
  if (!tenantId) return;
  try {
    const { data: tenantFlip, error: tenantErr } = await sb
      .from("tenants")
      .update({ is_active: true })
      .eq("id", tenantId)
      .eq("is_active", false)
      .select("id");
    if (tenantErr) console.error(`[activateTenant:${source}] tenant flip failed:`, tenantErr);
    else if (tenantFlip && tenantFlip.length > 0) {
      console.log(`[activateTenant:${source}] tenant ${tenantId} set is_active=true`);
    }

    const { data: gateFlip, error: gateErr } = await (sb as any)
      .from("tenant_demo_gate")
      .update({ enabled: false })
      .eq("tenant_id", tenantId)
      .eq("enabled", true)
      .select("tenant_id");
    if (gateErr) console.error(`[activateTenant:${source}] demo gate lift failed:`, gateErr);
    else if (gateFlip && gateFlip.length > 0) {
      console.log(`[activateTenant:${source}] tenant ${tenantId} demo gate disabled`);
    }
  } catch (e) {
    console.error(`[activateTenant:${source}] unexpected error:`, e);
  }
}
