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
    /** When set, attachment is rendered inline (multipart/related) and referenced via cid:<content_id> */
    content_id?: string;
    inline?: boolean;
  }>;
}

export interface EnqueuedEmail {
  id: string;
  status: string;
  email_account_id: string | null;
}

/**
 * Resolves the SMTP/Graph account to use for an outgoing email.
 *
 * Tenant/branch mail must never fall back to the platform sender. If no
 * branch/tenant account exists, return null and let the worker mark the row as
 * configuration-missing instead of silently sending as hello@document-centre.
 *
 * Resolution order:
 *   1. explicit email_account_id, only if it belongs to the same scope
 *   2. branch default → any active branch account
 *   3. tenant default → any active tenant-wide account
 *   4. platform default → any active platform account, platform-scope only
 */
export async function resolveEmailAccount(
  admin: SupabaseClient,
  opts: { tenant_id?: string | null; branch_id?: string | null; explicit_id?: string | null }
): Promise<string | null> {
  const { tenant_id, branch_id, explicit_id } = opts;
  const isScopedMail = !!tenant_id || !!branch_id;

  const accountMatchesScope = (account: { tenant_id: string | null; branch_id: string | null }) => {
    if (!isScopedMail) return account.tenant_id == null && account.branch_id == null;
    if (tenant_id && account.tenant_id !== tenant_id) return false;
    if (branch_id) return account.branch_id == null || account.branch_id === branch_id;
    return account.branch_id == null;
  };

  if (explicit_id) {
    const { data } = await admin
      .from("email_accounts")
      .select("id, tenant_id, branch_id, is_active")
      .eq("id", explicit_id)
      .maybeSingle();
    if (data?.is_active && accountMatchesScope(data)) return data.id;
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

    const { data: anyBranch } = await admin
      .from("email_accounts")
      .select("id")
      .eq("branch_id", branch_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (anyBranch?.id) return anyBranch.id;
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

  if (isScopedMail) return null;

  // Platform-level account (tenant_id IS NULL AND branch_id IS NULL)
  const { data: platformDefault } = await admin
    .from("email_accounts")
    .select("id")
    .is("tenant_id", null)
    .is("branch_id", null)
    .eq("is_active", true)
    .eq("is_default", true)
    .maybeSingle();
  if (platformDefault?.id) return platformDefault.id;

  const { data: anyPlatform } = await admin
    .from("email_accounts")
    .select("id")
    .is("tenant_id", null)
    .is("branch_id", null)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (anyPlatform?.id) return anyPlatform.id;

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
    attachments: input.attachments ?? [],
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
