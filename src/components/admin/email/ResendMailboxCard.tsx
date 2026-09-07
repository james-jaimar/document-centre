import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Copy, Loader2, Send, Trash2, Zap } from "lucide-react";

export interface ResendAccountRow {
  id: string;
  label: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  is_default: boolean;
  is_active: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  transport: string;
  resend_segment_id?: string | null;
}

interface Props {
  tenantId: string | null;
  branchId?: string | null;
  account?: ResendAccountRow;
  onChanged: () => void;
  onSetDefault: (id: string) => void;
  onTest: (id: string) => void;
  testingId: string | null;
  testRecipient: string;
  setTestRecipient: (v: string) => void;
}

export function ResendMailboxCard({
  tenantId,
  branchId = null,
  account,
  onChanged,
  onSetDefault,
  onTest,
  testingId,
  testRecipient,
  setTestRecipient,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({
    label: "Resend",
    from_name: "",
    from_email: "",
    reply_to: "",
    api_key: "",
    webhook_secret: "",
    is_default: true,
  });

  useEffect(() => {
    if (account) {
      setForm((f) => ({
        ...f,
        label: account.label,
        from_name: account.from_name,
        from_email: account.from_email,
        reply_to: account.reply_to ?? "",
        api_key: "",
        webhook_secret: "",
        is_default: account.is_default,
      }));
    }
  }, [account?.id]);

  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const webhookUrl = account && projectRef
    ? `https://${projectRef}.functions.supabase.co/resend-events?account=${account.id}`
    : null;

  const save = async () => {
    if (!tenantId) return;
    if (!form.from_email.trim() || !form.from_name.trim()) {
      toast.error("Add the sender name and address first");
      return;
    }
    if (!account && !form.api_key.trim()) {
      toast.error("Paste your Resend API key");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("email-account-manage", {
      body: {
        action: "upsert_resend",
        id: account?.id ?? null,
        tenant_id: tenantId,
        branch_id: branchId,
        label: form.label.trim() || "Resend",
        from_name: form.from_name.trim(),
        from_email: form.from_email.trim(),
        reply_to: form.reply_to.trim() || null,
        api_key: form.api_key.trim() || null,
        webhook_secret: form.webhook_secret.trim() || null,
        is_default: form.is_default,
        is_active: true,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error);
      return;
    }
    toast.success("Resend mailbox saved");
    setForm((f) => ({ ...f, api_key: "", webhook_secret: "" }));
    setOpen(false);
    onChanged();
  };

  const check = async () => {
    if (!account && !form.api_key.trim()) {
      toast.error("Paste your Resend API key first");
      return;
    }
    setChecking(true);
    const { data, error } = await supabase.functions.invoke("email-account-manage", {
      body: {
        action: "verify_resend",
        id: account?.id ?? null,
        tenant_id: tenantId,
        api_key: form.api_key.trim() || null,
        from_email: (form.from_email || account?.from_email || "").trim(),
      },
    });
    setChecking(false);
    const payload = data as { success?: boolean; message?: string; error?: string } | null;
    if (error || payload?.error) {
      toast.error(error?.message || payload?.error);
      return;
    }
    if (payload?.success) toast.success(payload.message ?? "Connected");
    else toast.error(payload?.message ?? "Could not verify the Resend account");
    onChanged();
  };

  const remove = async () => {
    if (!account) return;
    if (!confirm("Remove this Resend mailbox? Emails will fall back to your other mailboxes.")) return;
    const { data, error } = await supabase.functions.invoke("email-account-manage", {
      body: { action: "delete", id: account.id },
    });
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error);
      return;
    }
    toast.success("Resend mailbox removed");
    onChanged();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4" /> Connect Resend
        </CardTitle>
        <CardDescription>
          Use your own Resend account for this organisation's email. Marketing campaigns go out as
          Resend broadcasts (up to 1,000 contacts a month on their free plan) and everyday order,
          quote and account emails are sent through the same account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {account && !open ? (
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Zap className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{account.from_email}</span>
                  {account.last_verified_at && !account.last_error ? (
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not checked yet</Badge>
                  )}
                  {account.is_default && <Badge variant="default">Default</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">Sending as {account.from_name}</p>
                {account.last_error && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {account.last_error}
                  </p>
                )}
                {webhookUrl && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <div className="mb-1">
                      Paste this address into Resend → Webhooks so opens, clicks, bounces and
                      unsubscribes come back here:
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-1 break-all">{webhookUrl}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          toast.success("Copied");
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap gap-2 justify-end">
                {!account.is_default && (
                  <Button variant="outline" size="sm" onClick={() => onSetDefault(account.id)}>
                    Set as default
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={check} disabled={checking}>
                  {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null} Check connection
                </Button>
                <Button variant="outline" size="sm" onClick={() => onTest(account.id)} disabled={testingId === account.id}>
                  <Send className="h-3 w-3 mr-1" /> {testingId === account.id ? "Sending…" : "Send test"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Edit</Button>
                <Button variant="outline" size="sm" onClick={remove}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input
                type="email"
                placeholder="test recipient@example.com"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="max-w-xs h-8 text-xs"
              />
            </div>
          </div>
        ) : null}

        {!account && !open && (
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Zap className="h-4 w-4" /> Set up Resend
          </Button>
        )}

        {open && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Name</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Resend" />
              </div>
              <div className="grid gap-1.5">
                <Label>Sender name</Label>
                <Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} placeholder="Impress Print" />
              </div>
              <div className="grid gap-1.5">
                <Label>Sender address</Label>
                <Input
                  type="email"
                  value={form.from_email}
                  onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                  placeholder="hello@yourdomain.co.za"
                />
                <p className="text-xs text-muted-foreground">
                  Must be on a domain you have verified inside Resend.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label>Reply-to (optional)</Label>
                <Input
                  type="email"
                  value={form.reply_to}
                  onChange={(e) => setForm({ ...form, reply_to: e.target.value })}
                  placeholder="sales@yourdomain.co.za"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Resend API key{account ? " (leave blank to keep the current one)" : ""}</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  placeholder="re_..."
                />
                <p className="text-xs text-muted-foreground">
                  Stored encrypted. It is never shown again after saving.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label>Webhook signing secret (optional)</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  value={form.webhook_secret}
                  onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
                  placeholder="whsec_..."
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
              <Label className="font-normal">Send this organisation's email through Resend by default</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Save
              </Button>
              <Button variant="outline" onClick={check} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Check connection
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
