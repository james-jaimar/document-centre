// Outbound email dispatcher.
// - Cron-invoked every 30s via pg_cron.
// - Claims due rows from public.email_outbox (per-account concurrency cap).
// - Resolves SMTP creds from public.email_accounts (vault-stored password)
//   with platform-secret fallback for tenants that opted in.
// - Sends via denomailer SMTP and writes back status/attempts/Message-ID.
//
// Backoff: 1m, 5m, 15m, 1h, 6h → dlq.
import nodemailer from "npm:nodemailer@6.9.10";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

interface BaseCreds {
  id: string | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  send_delay_ms: number;
}

interface SmtpCreds extends BaseCreds {
  kind: "smtp";
  host: string;
  port: number;
  secure: "tls" | "starttls" | "none";
  username: string;
  password: string;
}

interface GraphCreds extends BaseCreds {
  kind: "graph";
  tenant_id: string;
  client_id: string;
  client_secret: string;
  sender: string;
}

type AccountCreds = SmtpCreds | GraphCreds;

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
      const transport = a.transport ?? "smtp";

      if (transport === "graph") {
        const clientSecret = await loadVaultSecret(admin, a.graph_client_secret_id);
        if (clientSecret && a.graph_tenant_id && a.graph_client_id && a.graph_sender_address) {
          return {
            kind: "graph",
            id: a.id,
            tenant_id: a.graph_tenant_id,
            client_id: a.graph_client_id,
            client_secret: clientSecret,
            sender: a.graph_sender_address,
            from_name: a.from_name,
            from_email: a.from_email,
            reply_to: a.reply_to,
            send_delay_ms: a.send_delay_ms ?? 1500,
          };
        }
      } else {
        const password = await loadVaultSecret(admin, a.smtp_password_secret_id);
        if (password) {
          return {
            kind: "smtp",
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
    kind: "smtp",
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

const SEND_TIMEOUT_MS = 60_000;
const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);

// ---- Microsoft Graph sender ----------------------------------------------
async function getGraphAccessToken(creds: GraphCreds): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${creds.tenant_id}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await withTimeout(
    fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }),
    20_000,
    "Graph token fetch"
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Graph token request failed: ${res.status} ${txt.slice(0, 400)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Graph token response missing access_token");
  return json.access_token as string;
}

function toGraphRecipients(addrs: string[] | string | null | undefined) {
  if (!addrs) return undefined;
  const list = Array.isArray(addrs) ? addrs : [addrs];
  return list.filter(Boolean).map((address) => ({ emailAddress: { address } }));
}

async function sendViaGraph(
  creds: GraphCreds,
  row: OutboxRow,
  fromName: string,
  fromEmail: string,
  replyTo: string | undefined
): Promise<{ messageId: string | null }> {
  console.log(`[graph] fetching token for tenant ${creds.tenant_id}`);
  const token = await getGraphAccessToken(creds);
  console.log(`[graph] got token (len=${token.length}); sending as ${creds.sender} -> ${row.to_email}`);
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(creds.sender)}/sendMail`;

  const message: Record<string, unknown> = {
    subject: row.subject,
    body: {
      contentType: row.html ? "HTML" : "Text",
      content: row.html ?? row.text_body ?? "",
    },
    toRecipients: toGraphRecipients(row.to_email),
    ccRecipients: toGraphRecipients(row.cc),
    bccRecipients: toGraphRecipients(row.bcc),
    from: { emailAddress: { address: fromEmail, name: fromName } },
  };
  if (replyTo) message.replyTo = toGraphRecipients(replyTo);

  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    }),
    SEND_TIMEOUT_MS,
    "Graph sendMail"
  );

  if (res.status === 202) {
    return { messageId: res.headers.get("x-ms-request-id") };
  }

  const text = await res.text();
  // Tag auth/permission errors so the caller can mark them terminal.
  if (res.status === 401 || res.status === 403) {
    throw new Error(`graph_auth ${res.status}: ${text.slice(0, 600)}`);
  }
  if (res.status === 429) {
    const retry = res.headers.get("Retry-After");
    throw new Error(`graph_rate_limited retry-after=${retry ?? "?"}: ${text.slice(0, 300)}`);
  }
  throw new Error(`Graph sendMail failed: ${res.status} ${text.slice(0, 600)}`);
}

// ---- Main per-row processor ----------------------------------------------
async function processOne(admin: any, row: OutboxRow): Promise<void> {
  console.log(`[dispatch] processOne start row=${row.id} to=${row.to_email} acct=${row.email_account_id}`);
  const creds = await resolveCreds(admin, row);
  console.log(`[dispatch] creds resolved kind=${creds?.kind ?? 'none'}`);
  if (!creds) {
    await admin
      .from("email_outbox")
      .update({
        status: "failed",
        attempts: row.attempts + 1,
        error_message: "No email account available (and platform fallback disabled)",
        locked_at: null,
        locked_by: null,
      })
      .eq("id", row.id);
    return;
  }

  const fromName = row.from_name ?? creds.from_name;
  const fromEmail = row.from_email ?? creds.from_email;
  const replyTo = row.reply_to ?? creds.reply_to ?? undefined;

  try {
    let messageId: string | null = null;

    if (creds.kind === "graph") {
      const result = await sendViaGraph(creds, row, fromName, fromEmail, replyTo);
      messageId = result.messageId;
    } else {
      // SMTP via nodemailer (port 465 = implicit TLS; 587 = STARTTLS upgrade)
      const useSecure = creds.port === 465;
      const transport = nodemailer.createTransport({
        host: creds.host,
        port: creds.port,
        secure: useSecure,
        auth: { user: creds.username, pass: creds.password },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 30_000,
        greetingTimeout: 30_000,
        socketTimeout: 60_000,
      });
      try {
        const info = await withTimeout(
          transport.sendMail({
            from: `${fromName} <${fromEmail}>`,
            to: row.to_email,
            cc: row.cc ?? undefined,
            bcc: row.bcc ?? undefined,
            replyTo,
            subject: row.subject,
            html: row.html ?? undefined,
            text: row.text_body ?? undefined,
          }),
          SEND_TIMEOUT_MS,
          "SMTP send"
        );
        messageId = (info as any)?.messageId ?? null;
      } finally {
        try { transport.close(); } catch (_) { /* ignore */ }
      }
    }

    await admin
      .from("email_outbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempts: row.attempts + 1,
        message_id: messageId,
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
    const msg = (e as Error).message ?? String(e);
    const newAttempts = row.attempts + 1;
    const isAuthError =
      /^graph_auth|auth|535|530|invalid login|credentials/i.test(msg);
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
  // anything stuck > 5m on the next cycle. Only run the revive UPDATE if
  // there's actually a stale 'sending' row, otherwise we'd write a no-op
  // WAL entry every cron tick (~288/day) for nothing.
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count: staleCount } = await admin
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "sending")
    .lt("locked_at", fiveMinAgo);

  if ((staleCount ?? 0) > 0) {
    await admin
      .from("email_outbox")
      .update({ status: "queued", locked_at: null, locked_by: null })
      .eq("status", "sending")
      .lt("locked_at", fiveMinAgo);
  }

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
