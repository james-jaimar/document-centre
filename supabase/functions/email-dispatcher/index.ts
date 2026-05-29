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

interface AttachmentSpec {
  filename: string;
  storage_bucket: string;
  storage_path: string;
  content_type?: string;
}

interface LoadedAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
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
  attachments: AttachmentSpec[] | null;
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB total per email

async function loadAttachments(
  admin: any,
  specs: AttachmentSpec[] | null | undefined
): Promise<LoadedAttachment[]> {
  if (!specs || !specs.length) return [];
  const out: LoadedAttachment[] = [];
  let total = 0;
  for (const s of specs) {
    const { data, error } = await admin.storage.from(s.storage_bucket).download(s.storage_path);
    if (error || !data) {
      throw new Error(`attachment_download_failed: ${s.storage_path} (${error?.message ?? "no data"})`);
    }
    const buf = new Uint8Array(await data.arrayBuffer());
    total += buf.byteLength;
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new Error(`attachment_too_large: total exceeds ${MAX_ATTACHMENT_BYTES} bytes`);
    }
    out.push({
      filename: s.filename,
      contentType: s.content_type || "application/octet-stream",
      bytes: buf,
    });
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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

interface GmailCreds extends BaseCreds {
  kind: "gmail_oauth";
  refresh_token: string;
  client_id: string;
  client_secret: string;
  oauth_email: string;
}

type AccountCreds = SmtpCreds | GraphCreds | GmailCreds;

async function loadVaultSecret(admin: any, secret_id: string | null): Promise<string | null> {
  if (!secret_id) return null;
  const { data, error } = await admin.rpc("read_email_account_secret", { p_secret_id: secret_id });
  if (error) {
    console.error("read_email_account_secret error:", error.message);
    return null;
  }
  return (data as string) ?? null;
}

/** Build AccountCreds from a fully-fetched email_accounts row, honouring its transport. */
async function buildCredsFromAccount(
  admin: ReturnType<typeof createClient>,
  a: any,
): Promise<AccountCreds | null> {
  if (!a || !a.is_active) return null;
  const transport = a.transport ?? "smtp";

  if (transport === "graph") {
    const clientSecret = await loadVaultSecret(admin, a.graph_client_secret_id);
    if (!clientSecret || !a.graph_tenant_id || !a.graph_client_id || !a.graph_sender_address) return null;
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

  if (transport === "gmail_oauth") {
    const refreshToken = await loadVaultSecret(admin, a.oauth_refresh_token_secret_id);
    const gmailClientId = Deno.env.get("GMAIL_OAUTH_CLIENT_ID");
    const gmailClientSecret = Deno.env.get("GMAIL_OAUTH_CLIENT_SECRET");
    if (!refreshToken || !gmailClientId || !gmailClientSecret || !a.oauth_email) return null;
    return {
      kind: "gmail_oauth",
      id: a.id,
      refresh_token: refreshToken,
      client_id: gmailClientId,
      client_secret: gmailClientSecret,
      oauth_email: a.oauth_email,
      from_name: a.from_name,
      from_email: a.from_email,
      reply_to: a.reply_to,
      send_delay_ms: a.send_delay_ms ?? 1500,
    };
  }

  // smtp
  const password = await loadVaultSecret(admin, a.smtp_password_secret_id);
  if (!password) return null;
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
    const built = await buildCredsFromAccount(admin, acct);
    if (built) return built;
  }

  // 2. Tenant-scoped lookup with branch preference (any transport).
  if (row.tenant_id) {
    const { data: tenantAccounts } = await admin
      .from("email_accounts")
      .select("*")
      .eq("is_active", true)
      .eq("tenant_id", row.tenant_id);
    const accounts = (tenantAccounts as any[]) ?? [];

    const candidates = [
      // Branch-scoped default
      row.branch_id ? accounts.find((a) => a.branch_id === row.branch_id && a.is_default) : null,
      // Any branch-scoped
      row.branch_id ? accounts.find((a) => a.branch_id === row.branch_id) : null,
      // Tenant-wide default (no branch)
      accounts.find((a) => !a.branch_id && a.is_default),
      // Any tenant-wide
      accounts.find((a) => !a.branch_id),
      // Any account for this tenant
      accounts[0],
    ].filter(Boolean);

    for (const cand of candidates) {
      const built = await buildCredsFromAccount(admin, cand);
      if (built) return built;
    }
  }

  // 3. Last-resort: any active Graph account anywhere (legacy platform fallback)
  const { data: graphAccounts } = await admin
    .from("email_accounts")
    .select("*")
    .eq("is_active", true)
    .eq("transport", "graph")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  for (const a of (graphAccounts as any[]) ?? []) {
    const built = await buildCredsFromAccount(admin, a);
    if (built) return built;
  }
  return null;
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
  replyTo: string | undefined,
  attachments: LoadedAttachment[]
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
  if (attachments.length) {
    message.attachments = attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.contentType,
      contentBytes: bytesToBase64(a.bytes),
    }));
  }


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

// ---- Gmail API sender ----------------------------------------------
async function getGmailAccessToken(creds: GmailCreds): Promise<string> {
  const res = await withTimeout(
    fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
      }),
    }),
    20_000,
    "Gmail token refresh"
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`gmail_auth token refresh failed: ${res.status} ${txt.slice(0, 400)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("Gmail token response missing access_token");
  return json.access_token as string;
}

function buildRfc2822(
  fromName: string,
  fromEmail: string,
  row: OutboxRow,
  replyTo: string | undefined,
  attachments: LoadedAttachment[]
): string {
  const headers: string[] = [];
  headers.push(`From: ${fromName} <${fromEmail}>`);
  headers.push(`To: ${row.to_email}`);
  if (row.cc?.length) headers.push(`Cc: ${row.cc.join(", ")}`);
  if (row.bcc?.length) headers.push(`Bcc: ${row.bcc.join(", ")}`);
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  headers.push(`Subject: ${row.subject}`);
  headers.push("MIME-Version: 1.0");

  const htmlBody = row.html ?? row.text_body ?? "";

  if (!attachments.length) {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    return headers.join("\r\n") + "\r\n\r\n" + htmlBody;
  }

  const boundary = `==DC_BOUNDARY_${crypto.randomUUID().replace(/-/g, "")}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [];
  parts.push(
    `--${boundary}\r\n` +
      'Content-Type: text/html; charset="UTF-8"\r\n' +
      "Content-Transfer-Encoding: 7bit\r\n\r\n" +
      htmlBody
  );
  for (const a of attachments) {
    const b64 = bytesToBase64(a.bytes).replace(/.{76}/g, "$&\r\n");
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${a.contentType}; name="${a.filename}"\r\n` +
        `Content-Disposition: attachment; filename="${a.filename}"\r\n` +
        "Content-Transfer-Encoding: base64\r\n\r\n" +
        b64
    );
  }
  return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n") + `\r\n--${boundary}--\r\n`;
}

function base64UrlEncode(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendViaGmail(
  creds: GmailCreds,
  row: OutboxRow,
  fromName: string,
  fromEmail: string,
  replyTo: string | undefined,
  attachments: LoadedAttachment[]
): Promise<{ messageId: string | null }> {
  console.log(`[gmail] refreshing token for ${creds.oauth_email}`);
  const token = await getGmailAccessToken(creds);
  console.log(`[gmail] got token; sending as ${fromEmail} -> ${row.to_email}`);

  const raw = base64UrlEncode(buildRfc2822(fromName, fromEmail, row, replyTo, attachments));


  const res = await withTimeout(
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }),
    SEND_TIMEOUT_MS,
    "Gmail send"
  );

  if (res.ok) {
    const data = await res.json();
    return { messageId: data.id ?? null };
  }

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new Error(`gmail_auth ${res.status}: ${text.slice(0, 600)}`);
  }
  if (res.status === 429) {
    throw new Error(`gmail_rate_limited: ${text.slice(0, 300)}`);
  }
  throw new Error(`Gmail send failed: ${res.status} ${text.slice(0, 600)}`);
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

    const loadedAttachments = await loadAttachments(admin, row.attachments);
    if (loadedAttachments.length) {
      console.log(`[dispatch] loaded ${loadedAttachments.length} attachment(s) for row=${row.id}`);
    }

    if (creds.kind === "graph") {
      console.log(`[dispatch] entering sendViaGraph for row=${row.id}`);
      const result = await sendViaGraph(creds, row, fromName, fromEmail, replyTo, loadedAttachments);
      console.log(`[dispatch] sendViaGraph returned messageId=${result.messageId}`);
      messageId = result.messageId;
    } else if (creds.kind === "gmail_oauth") {
      console.log(`[dispatch] entering sendViaGmail for row=${row.id}`);
      const result = await sendViaGmail(creds, row, fromName, fromEmail, replyTo, loadedAttachments);
      console.log(`[dispatch] sendViaGmail returned messageId=${result.messageId}`);
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
            attachments: loadedAttachments.length
              ? loadedAttachments.map((a) => ({
                  filename: a.filename,
                  content: a.bytes,
                  contentType: a.contentType,
                }))
              : undefined,
          }),
          SEND_TIMEOUT_MS,
          "SMTP send"
        );
        messageId = (info as any)?.messageId ?? null;
      } finally {
        try { transport.close(); } catch (_) { /* ignore */ }
      }
    }

    console.log(`[dispatch] marking sent row=${row.id}`);
    const { error: updErr } = await admin
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
    if (updErr) console.error(`[dispatch] sent-update failed row=${row.id}: ${updErr.message}`);

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
    console.error(`[dispatch] send failed row=${row.id}: ${msg}`);
    const newAttempts = row.attempts + 1;
    const isAuthError =
      /^graph_auth|^gmail_auth|auth|535|530|invalid login|credentials/i.test(msg);
    const exhausted = newAttempts >= row.max_attempts;
    const status = isAuthError ? "failed" : exhausted ? "dlq" : "queued";

    const { error: updErr } = await admin
      .from("email_outbox")
      .update({
        status,
        attempts: newAttempts,
        error_message: msg.slice(0, 1000),
        // next_attempt_at is NOT NULL — leave it in the past for terminal statuses so it's no longer due.
        next_attempt_at: status === "queued" ? nextAttemptAt(newAttempts) : new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq("id", row.id);
    if (updErr) console.error(`[dispatch] failed-update failed row=${row.id}: ${updErr.message}`);

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
