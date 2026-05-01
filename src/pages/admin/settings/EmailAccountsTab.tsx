import { useEffect, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Send, AlertCircle, CheckCircle2, Mail, Shield, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTenantSettingsMap, useUpsertTenantSetting } from "@/hooks/useTenantSettings";

interface EmailAccount {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  label: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: "tls" | "starttls" | "none" | null;
  smtp_username: string | null;
  is_default: boolean;
  is_active: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  transport: "smtp" | "gmail_oauth" | "graph";
  oauth_email: string | null;
}

const blank = (tenant_id: string): Partial<EmailAccount> & { smtp_password?: string } => ({
  tenant_id,
  label: "",
  from_name: "",
  from_email: "",
  reply_to: "",
  smtp_host: "",
  smtp_port: 587,
  smtp_secure: "starttls",
  smtp_username: "",
  smtp_password: "",
  is_default: false,
  is_active: true,
  branch_id: null,
  transport: "smtp",
});

type SendMethod = "platform" | "own_smtp";

export function EmailAccountsTab() {
  const { tenantId } = useTenantContext();
  const { settingsMap, isLoading: settingsLoading } = useTenantSettingsMap("email");
  const upsertSetting = useUpsertTenantSetting();

  const sendMethod = ((settingsMap.email_send_method as string) || "platform") as SendMethod;
  const systemName = (settingsMap.email_system_name as string) || "";
  const emailNote = (settingsMap.email_note as string) || "";

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [connectingGmail, setConnectingGmail] = useState(false);

  const [localSystemName, setLocalSystemName] = useState("");
  const [localNote, setLocalNote] = useState("");

  useEffect(() => {
    if (!settingsLoading) {
      setLocalSystemName(systemName);
      setLocalNote(emailNote);
    }
  }, [settingsLoading, systemName, emailNote]);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("email_accounts")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setAccounts((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const setSendMethod = (method: SendMethod) => {
    upsertSetting.mutate({
      category: "email",
      setting_key: "email_send_method",
      setting_value: method,
    });
  };

  const saveSystemFields = () => {
    const updates: Parameters<typeof upsertSetting.mutate>[0][] = [];
    if (localSystemName !== systemName) {
      updates.push({ category: "email", setting_key: "email_system_name", setting_value: localSystemName });
    }
    if (localNote !== emailNote) {
      updates.push({ category: "email", setting_key: "email_note", setting_value: localNote });
    }
    updates.forEach((u) => upsertSetting.mutate(u));
    if (updates.length) toast.success("Email settings saved");
  };

  const save = async () => {
    if (!editing || !tenantId) return;
    if (!editing.label || !editing.from_email || !editing.smtp_host || !editing.smtp_username) {
      toast.error("Please fill all required fields");
      return;
    }
    if (!editing.id && !editing.smtp_password) {
      toast.error("Password is required for new accounts");
      return;
    }
    const { data, error } = await supabase.functions.invoke("email-account-manage", {
      body: { action: "upsert", ...editing },
    });
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error);
      return;
    }
    toast.success("Saved");
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this email account?")) return;
    const { data, error } = await supabase.functions.invoke("email-account-manage", {
      body: { action: "delete", id },
    });
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error);
      return;
    }
    toast.success("Deleted");
    load();
  };

  const test = async (id: string) => {
    if (!testRecipient) { toast.error("Enter a recipient first"); return; }
    setTestingId(id);
    const { data, error } = await supabase.functions.invoke("email-account-manage", {
      body: { action: "test_send", id, recipient: testRecipient },
    });
    setTestingId(null);
    if (error || (data as any)?.error) {
      toast.error(`Test failed: ${error?.message || (data as any)?.error}`);
      load();
      return;
    }
    toast.success("Test email sent");
    load();
  };

  // Gmail OAuth flow
  const gmailAccount = accounts.find((a) => a.transport === "gmail_oauth");
  const smtpAccounts = accounts.filter((a) => a.transport === "smtp");

  const connectGmail = async () => {
    if (!tenantId) return;
    setConnectingGmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-oauth-connect", {
        body: { action: "authorize", tenant_id: tenantId },
      });
      if (error || data?.error) {
        toast.error(error?.message || data?.error);
        setConnectingGmail(false);
        return;
      }
      // Open Google consent in a popup
      const popup = window.open(data.authorize_url, "gmail-oauth", "width=600,height=700,scrollbars=yes");
      // Poll for the popup closing and check for the callback
      const pollInterval = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(pollInterval);
          setConnectingGmail(false);
          // Reload accounts to check if connection succeeded
          await load();
        }
      }, 1000);

      // Also listen for message from the popup (for callback handling)
      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type === "gmail-oauth-callback") {
          clearInterval(pollInterval);
          popup?.close();
          window.removeEventListener("message", handleMessage);
          setConnectingGmail(false);

          if (event.data.success) {
            toast.success(`Gmail connected: ${event.data.email}`);
          } else {
            toast.error(event.data.error || "Gmail connection failed");
          }
          await load();
        }
      };
      window.addEventListener("message", handleMessage);
    } catch (e) {
      toast.error((e as Error).message);
      setConnectingGmail(false);
    }
  };

  const disconnectGmail = async () => {
    if (!gmailAccount) return;
    if (!confirm("Disconnect Gmail? Emails will no longer be sent via this account.")) return;
    const { data, error } = await supabase.functions.invoke("gmail-oauth-connect", {
      body: { action: "disconnect", account_id: gmailAccount.id },
    });
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error);
      return;
    }
    toast.success("Gmail disconnected");
    load();
  };

  return (
    <div className="space-y-6">
      {/* ── Send Method Selector ── */}
      <div>
        <h3 className="text-lg font-semibold mb-3">System Emails</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Platform option */}
          <button
            type="button"
            onClick={() => setSendMethod("platform")}
            className={`relative rounded-lg border-2 p-5 text-left transition-colors ${
              sendMethod === "platform"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                sendMethod === "platform" ? "border-primary" : "border-muted-foreground/40"
              }`}>
                {sendMethod === "platform" && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">Send via Document Centre</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Guaranteed delivery using dedicated, safeguarded IP address. No configuration required.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  noreply@document-centre.com
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> SPF
                  </Badge>
                  <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> DKIM
                  </Badge>
                  <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> DMARC
                  </Badge>
                </div>
              </div>
            </div>
          </button>

          {/* Own SMTP option */}
          <button
            type="button"
            onClick={() => setSendMethod("own_smtp")}
            className={`relative rounded-lg border-2 p-5 text-left transition-colors ${
              sendMethod === "own_smtp"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                sendMethod === "own_smtp" ? "border-primary" : "border-muted-foreground/40"
              }`}>
                {sendMethod === "own_smtp" && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">Send via your own domain</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Use your own SMTP mailbox or connect your Gmail account. Emails are sent from your domain.
                </p>
                {smtpAccounts.length > 0 && sendMethod === "own_smtp" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {smtpAccounts[0].from_name} &lt;{smtpAccounts[0].from_email}&gt;
                  </p>
                )}
                {gmailAccount && sendMethod === "own_smtp" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Gmail: {gmailAccount.oauth_email}
                  </p>
                )}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ── System Name & Note ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Identity</CardTitle>
          <CardDescription>
            The system name appears in email headers and subjects. The note is appended to order notification emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label>System name</Label>
            <Input
              value={localSystemName}
              onChange={(e) => setLocalSystemName(e.target.value)}
              placeholder="Your company name"
              className="max-w-sm"
            />
            <p className="text-xs text-muted-foreground">
              Defaults to your organisation's trading name if left blank.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Note</Label>
            <Textarea
              value={localNote}
              onChange={(e) => setLocalNote(e.target.value)}
              placeholder="e.g. PLEASE UPLOAD PROOF OF PAYMENT TO THE MESSAGE AREA OF YOUR ORDER"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              This message is included in order-related emails sent to customers.
            </p>
          </div>
          <Button
            size="sm"
            onClick={saveSystemFields}
            disabled={localSystemName === systemName && localNote === emailNote}
          >
            Save
          </Button>
        </CardContent>
      </Card>

      {/* ── Gmail OAuth Connection ── */}
      {sendMethod === "own_smtp" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Connect Gmail
            </CardTitle>
            <CardDescription>
              Send emails directly from your Gmail or Google Workspace account. No SMTP configuration needed — just sign in with Google.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gmailAccount ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{gmailAccount.oauth_email}</span>
                      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Emails will be sent from this Gmail account.
                    </p>
                    {gmailAccount.last_error && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {gmailAccount.last_error}
                      </p>
                    )}
                    {gmailAccount.last_verified_at && !gmailAccount.last_error && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last sent: {new Date(gmailAccount.last_verified_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={disconnectGmail}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">
                  Click below to authorize Document Centre to send emails from your Gmail account. We only request send permission — we never read your inbox.
                </p>
                <Button
                  onClick={connectGmail}
                  disabled={connectingGmail}
                  className="gap-2"
                >
                  {connectingGmail ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  Connect with Google
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SMTP Accounts (only when own_smtp) ── */}
      {sendMethod === "own_smtp" && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>SMTP Email Accounts</CardTitle>
              <CardDescription>
                Configure outgoing email mailboxes for your organisation. The default account is used for all auth, order, and notification emails. Add a branch-scoped account to send from a specific branch's mailbox.
              </CardDescription>
            </div>
            <Button onClick={() => setEditing(blank(tenantId!))}>
              <Plus className="h-4 w-4 mr-1" /> Add account
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Test recipient:</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : smtpAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No SMTP accounts yet. Add one to start sending from your own mailbox, or connect Gmail above.</p>
            ) : (
              <div className="grid gap-3">
                {smtpAccounts.map((a) => (
                  <div key={a.id} className="rounded-lg border p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{a.label}</span>
                          {a.is_default && <Badge variant="default">Default</Badge>}
                          {a.branch_id && <Badge variant="secondary">Branch</Badge>}
                          {!a.is_active && <Badge variant="outline">Disabled</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {a.from_name} &lt;{a.from_email}&gt; · {a.smtp_host}:{a.smtp_port} ({a.smtp_secure})
                        </p>
                        {a.last_error ? (
                          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> {a.last_error}
                          </p>
                        ) : a.last_verified_at ? (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-green-600" /> Verified {new Date(a.last_verified_at).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => test(a.id)} disabled={testingId === a.id}>
                          <Send className="h-3 w-3 mr-1" /> {testingId === a.id ? "Sending…" : "Test"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing({ ...a, smtp_password: "" })}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit account" : "New email account"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Label *</Label>
                <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="e.g. Main, Sandton branch" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>From name *</Label>
                  <Input value={editing.from_name} onChange={(e) => setEditing({ ...editing, from_name: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>From email *</Label>
                  <Input type="email" value={editing.from_email} onChange={(e) => setEditing({ ...editing, from_email: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Reply-To</Label>
                <Input type="email" value={editing.reply_to ?? ""} onChange={(e) => setEditing({ ...editing, reply_to: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 grid gap-1.5">
                  <Label>SMTP host *</Label>
                  <Input value={editing.smtp_host} onChange={(e) => setEditing({ ...editing, smtp_host: e.target.value })} placeholder="smtp.example.com" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Port *</Label>
                  <Input type="number" value={editing.smtp_port} onChange={(e) => setEditing({ ...editing, smtp_port: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Security *</Label>
                  <Select value={editing.smtp_secure} onValueChange={(v) => setEditing({ ...editing, smtp_secure: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">TLS (port 465)</SelectItem>
                      <SelectItem value="starttls">STARTTLS (port 587)</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Username *</Label>
                  <Input value={editing.smtp_username} onChange={(e) => setEditing({ ...editing, smtp_username: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>{editing.id ? "Password (leave blank to keep)" : "Password *"}</Label>
                <Input type="password" value={editing.smtp_password ?? ""} onChange={(e) => setEditing({ ...editing, smtp_password: e.target.value })} />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={editing.is_default} onCheckedChange={(v) => setEditing({ ...editing, is_default: v })} />
                  <Label>Default for tenant</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
