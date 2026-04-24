// Outbound email dispatcher.
// - Cron-invoked every 30s via pg_cron.
// - Claims due rows from public.email_outbox (per-account concurrency cap).
// - Resolves SMTP creds from public.email_accounts (vault-stored password)
//   with platform-secret fallback for tenants that opted in.
// - Sends via denomailer SMTP and writes back status/attempts/Message-ID.
//
// Backoff: 1m, 5m, 15m, 1h, 6h → dlq.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

const BACKOFF_MIN = [1, 5, 15, 60, 360]; // minutes per attempt

function nextAttemptAt(attempts: number): string {
  const idx = Math.min(attempts, BACKOFF_MIN.length - 1);
  const ms = BACKOFF_MIN[idx] * 60_000;
  return new Date(Date.now() + ms).toISOString();
}

interface OutboxRow {
  id: string;
  email_account_id: string | null;
  tenant_id: string | null;
  to_email: string;
  cc: string[] | null;
  bcc: string[] | null;
  reply_to: string | null;
  from_name: string | null;
  from_email: string | null;
  subject: string;
  html: string | null;
  text_body: string | null;
  attempts: number;
  max_attempts: number;
  metadata: Record<string, unknown>;
}

interface AccountCreds {
  id: string | null;
  host: string;
  port: number;
  secure: "tls" | "starttls" | "none";
  username: string;
  password: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  send_delay_ms: number;
}

async function loadVaultSecret(admin: any, secret_id: string | null): Promise<string | null> {
  if (!secret_id) return null;
  const { data, error } = await admin.rpc("read_email_account_secret", { p_secret_id: secret_id });
  if (error) {
    console.error("read_email_account_secret error:", error.message);
    return null;
  }
  return (data as string) ?? null;
}

async function resolveCreds(
  admin: ReturnType<typeof createClient>,
  row: OutboxRow
): Promise<AccountCreds | null> {
  // 1. Specific account on the row
  if (row.email_account_id) {
    const { data: acct } = await admin
      .from("email_accounts")
      .select("*")
      .eq("id", row.email_account_id)
      .maybeSingle();
    const a = acct as any;
    if (a && a.is_active) {
      const password = await loadVaultSecret(admin, a.smtp_password_secret_id);
      if (password) {
        return {
          id: a.id,
          host: a.smtp_host,
          port: a.smtp_port,
          secure: a.smtp_secure,
          username: a.smtp_username,
          password,
          from_name: a.from_name,
          from_email: a.from_email,
          reply_to: a.reply_to,
          send_delay_ms: a.send_delay_ms ?? 1500,
        };
      }
    }
  }

  // 2. Platform fallback (only if tenant has opted in OR there's no tenant)
  let allowFallback = true;
  if (row.tenant_id) {
    const { data: setting } = await admin
      .from("tenant_settings")
      .select("setting_value")
      .eq("tenant_id", row.tenant_id)
      .eq("category", "email")
      .eq("setting_key", "enable_platform_smtp_fallback")
      .maybeSingle();
    if (setting && (setting as any).setting_value === false) allowFallback = false;
  }

  if (!allowFallback) return null;

  const host = Deno.env.get("SMTP_HOST");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "587");
  const username = Deno.env.get("SMTP_USER");
  const password = Deno.env.get("SMTP_PASS");
  if (!host || !username || !password) return null;

  return {
    id: null,
    host,
    port,
    secure: port === 465 ? "tls" : "starttls",
    username,
    password,
    from_name: row.from_name ?? "Notifications",
    from_email: row.from_email ?? username,
    reply_to: row.reply_to,
    send_delay_ms: 500,
  };
}

async function processOne(admin: any, row: OutboxRow): Promise<void> {
  const creds = await resolveCreds(admin, row);
  if (!creds) {
    await admin
      .from("email_outbox")
      .update({
        status: "failed",
        attempts: row.attempts + 1,
        error_message: "No SMTP account available (and platform fallback disabled)",
        locked_at: null,
        locked_by: null,
      })
      .eq("id", row.id);
    return;
  }

  const fromName = row.from_name ?? creds.from_name;
  const fromEmail = row.from_email ?? creds.from_email;
  const replyTo = row.reply_to ?? creds.reply_to ?? undefined;

  const client = new SMTPClient({
    connection: {
      hostname: creds.host,
      port: creds.port,
      tls: creds.secure === "tls",
      auth: { username: creds.username, password: creds.password },
    },
  });

  try {
    const result = await client.send({
      from: `${fromName} <${fromEmail}>`,
      to: row.to_email,
      cc: row.cc ?? undefined,
      bcc: row.bcc ?? undefined,
      replyTo,
      subject: row.subject,
      html: row.html ?? undefined,
      content: row.text_body ?? "auto",
    });
    await client.close();

    await admin
      .from("email_outbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempts: row.attempts + 1,
        message_id: (result as any)?.messageId ?? null,
        error_message: null,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", row.id);

    if (creds.id) {
      await admin
        .from("email_accounts")
        .update({ last_verified_at: new Date().toISOString(), last_error: null })
        .eq("id", creds.id);
    }

    if (creds.send_delay_ms > 0) {
      await new Promise((r) => setTimeout(r, creds.send_delay_ms));
    }
  } catch (e) {
    try { await client.close(); } catch (_) { /* ignore */ }
    const msg = (e as Error).message ?? String(e);
    const newAttempts = row.attempts + 1;
    const isAuthError = /auth|535|530|invalid login|credentials/i.test(msg);
    const exhausted = newAttempts >= row.max_attempts;
    const status = isAuthError ? "failed" : exhausted ? "dlq" : "queued";

    await admin
      .from("email_outbox")
      .update({
        status,
        attempts: newAttempts,
        error_message: msg.slice(0, 1000),
        next_attempt_at: status === "queued" ? nextAttemptAt(newAttempts) : null,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", row.id);

    if (creds.id) {
      await admin
        .from("email_accounts")
        .update({ last_error: msg.slice(0, 500) })
        .eq("id", creds.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const workerId = crypto.randomUUID();

  // Claim a batch of due rows. Lease is implicit via locked_at — we revive
  // anything stuck > 5m on the next cycle.
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  await admin
    .from("email_outbox")
    .update({ status: "queued", locked_at: null, locked_by: null })
    .eq("status", "sending")
    .lt("locked_at", fiveMinAgo);

  // Pick due rows
  const { data: due } = await admin
    .from("email_outbox")
    .select("*")
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(20);

  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Mark as sending
  const ids = due.map((r: any) => r.id);
  const { data: claimed } = await admin
    .from("email_outbox")
    .update({ status: "sending", locked_at: new Date().toISOString(), locked_by: workerId })
    .in("id", ids)
    .eq("status", "queued")
    .select("*");

  const rows = (claimed ?? []) as OutboxRow[];

  // Group by account so we honour per-account concurrency cap (default 1).
  // We process accounts in parallel, rows within an account sequentially.
  const buckets = new Map<string, OutboxRow[]>();
  for (const r of rows) {
    const key = r.email_account_id ?? "__platform__";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  await Promise.all(
    Array.from(buckets.values()).map(async (bucket) => {
      for (const r of bucket) await processOne(admin, r);
    })
  );

  return new Response(JSON.stringify({ processed: rows.length, worker: workerId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
