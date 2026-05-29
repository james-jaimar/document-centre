// Shared helper: enqueue an email into public.email_outbox.
// Used by send-email, send-order-email, manage-user, invite-member,
// invite-platform-admin, request-password-reset, request-signup.
// Note: typed as `any` to avoid cross-version SupabaseClient mismatches
// between callers pinned to different supabase-js releases.
type SupabaseClient = any;

export interface EnqueueEmailInput {
  tenant_id?: string | null;
  branch_id?: string | null;
  app_id?: string | null;
  email_account_id?: string | null;

  to: string;
  cc?: string[] | null;
  bcc?: string[] | null;
  reply_to?: string | null;
  from_name?: string | null;
  from_email?: string | null;

  subject: string;
  html?: string | null;
  text?: string | null;

  category?: "auth" | "order" | "invite" | "transactional" | "manual" | "system";
  related_type?: string | null;
  related_id?: string | null;

  scheduled_for?: string | null;
  created_by_profile_id?: string | null;
  metadata?: Record<string, unknown>;
  attachments?: Array<{
    filename: string;
    storage_bucket: string;
    storage_path: string;
    content_type?: string;
  }>;
}

export interface EnqueuedEmail {
  id: string;
  status: string;
  email_account_id: string | null;
}

/**
 * Resolves the SMTP account to use for an outgoing email:
 *   1. explicit email_account_id (validated)
 *   2. branch default (if branch_id given and a branch-level account exists)
 *   3. tenant default
 *   4. null  → caller decides (platform fallback handled at dispatcher level)
 */
export async function resolveEmailAccount(
  admin: SupabaseClient,
  opts: { tenant_id?: string | null; branch_id?: string | null; explicit_id?: string | null }
): Promise<string | null> {
  const { tenant_id, branch_id, explicit_id } = opts;

  if (explicit_id) {
    const { data } = await admin
      .from("email_accounts")
      .select("id, is_active")
      .eq("id", explicit_id)
      .maybeSingle();
    if (data?.is_active) return data.id;
  }

  // Check the tenant's preferred send method.
  // "platform" (default) → return null so the dispatcher falls back to the platform account.
  // "own_smtp" → continue resolving through tenant/branch accounts.
  if (tenant_id) {
    const { data: methodRow } = await admin
      .from("tenant_settings")
      .select("setting_value")
      .eq("tenant_id", tenant_id)
      .eq("category", "email")
      .eq("setting_key", "email_send_method")
      .maybeSingle();

    const sendMethod = (methodRow?.setting_value as string) ?? "platform";
    if (sendMethod === "platform") {
      // Skip tenant SMTP — let dispatcher use platform fallback
      return null;
    }
  }

  if (branch_id) {
    const { data } = await admin
      .from("email_accounts")
      .select("id")
      .eq("branch_id", branch_id)
      .eq("is_active", true)
      .eq("is_default", true)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (tenant_id) {
    const { data } = await admin
      .from("email_accounts")
      .select("id")
      .eq("tenant_id", tenant_id)
      .is("branch_id", null)
      .eq("is_active", true)
      .eq("is_default", true)
      .maybeSingle();
    if (data?.id) return data.id;

    // No explicit default — use any active tenant-level account
    const { data: any } = await admin
      .from("email_accounts")
      .select("id")
      .eq("tenant_id", tenant_id)
      .is("branch_id", null)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (any?.id) return any.id;
  }

  // Final fallback: first active Graph account anywhere on the platform.
  const { data: graphFallback } = await admin
    .from("email_accounts")
    .select("id")
    .eq("is_active", true)
    .eq("transport", "graph")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (graphFallback?.id) return graphFallback.id;

  return null;
}

export async function enqueueEmail(
  admin: SupabaseClient,
  input: EnqueueEmailInput
): Promise<EnqueuedEmail> {
  const account_id = await resolveEmailAccount(admin, {
    tenant_id: input.tenant_id ?? null,
    branch_id: input.branch_id ?? null,
    explicit_id: input.email_account_id ?? null,
  });

  const row = {
    tenant_id: input.tenant_id ?? null,
    branch_id: input.branch_id ?? null,
    app_id: input.app_id ?? null,
    email_account_id: account_id,
    to_email: input.to,
    cc: input.cc ?? null,
    bcc: input.bcc ?? null,
    reply_to: input.reply_to ?? null,
    from_name: input.from_name ?? null,
    from_email: input.from_email ?? null,
    subject: input.subject,
    html: input.html ?? null,
    text_body: input.text ?? null,
    category: input.category ?? "transactional",
    related_type: input.related_type ?? null,
    related_id: input.related_id ?? null,
    scheduled_for: input.scheduled_for ?? null,
    next_attempt_at: input.scheduled_for ?? new Date().toISOString(),
    created_by_profile_id: input.created_by_profile_id ?? null,
    metadata: input.metadata ?? {},
    status: "queued",
  };

  const { data, error } = await admin
    .from("email_outbox")
    .insert(row)
    .select("id, status, email_account_id")
    .single();

  if (error) throw new Error(`enqueueEmail: ${error.message}`);
  return data as EnqueuedEmail;
}
