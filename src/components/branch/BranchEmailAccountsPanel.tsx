import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Send, Trash2, AlertCircle, CheckCircle2, Mail, ShieldCheck } from "lucide-react";

interface SmtpAccount {
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
  transport: string;
}

const blank = (tenantId: string, branchId: string) => ({
  tenant_id: tenantId,
  branch_id: branchId,
  label: "",
  from_name: "",
  from_email: "",
  reply_to: "",
  smtp_host: "",
  smtp_port: 587,
  smtp_secure: "starttls" as const,
  smtp_username: "",
  smtp_password: "",
  is_default: true,
  is_active: true,
  transport: "smtp" as const,
});

interface Props {
  tenantId: string;
  branchId: string;
}

export function BranchEmailAccountsPanel({ tenantId, branchId }: Props) {
  const [accounts, setAccounts] = useState<SmtpAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_accounts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setAccounts((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId && branchId) load(); /* eslint-disable-next-line */ }, [tenantId, branchId]);

  const save = async () => {
    if (!editing) return;
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

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> Branch Email (SMTP)
          </CardTitle>
          <CardDescription>
            These credentials are used only to send emails from this branch (order confirmations, proformas, etc.).
            They are encrypted, stored securely, and never visible to other branches.
          </CardDescription>
        </div>
        <Button onClick={() => setEditing(blank(tenantId, branchId))}>
          <Plus className="h-4 w-4 mr-1" /> Add account
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2 rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
          <div>
            Use a dedicated mailbox (e.g. <code>orders@yourbranch.co.za</code>). For Gmail/Google Workspace, generate an "App password" in your Google account security settings.
          </div>
        </div>

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
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No email accounts yet. Add one to start sending from this branch.</p>
        ) : (
          <div className="grid gap-3">
            {accounts.map((a) => (
              <div key={a.id} className="rounded-lg border p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{a.label}</span>
                      {a.is_default && <Badge variant="default">Default</Badge>}
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit account" : "New branch email account"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Label *</Label>
                <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="e.g. Orders mailbox" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>From name *</Label>
                  <Input value={editing.from_name} onChange={(e) => setEditing({ ...editing, from_name: e.target.value })} placeholder="e.g. PostNet Sandton" />
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
                  <Input value={editing.smtp_host} onChange={(e) => setEditing({ ...editing, smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
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
                  <Label>Default for this branch</Label>
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
    </Card>
  );
}
