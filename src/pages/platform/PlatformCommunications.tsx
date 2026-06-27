import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Send, Save, Megaphone, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Tenant { id: string; name: string; slug: string | null; }
interface Branch { id: string; name: string; email: string | null; trading_name: string | null; }
interface Template {
  id: string; slug: string; name: string; description: string | null;
  subject: string; body_html: string; body_text: string | null; is_system: boolean;
}
interface Campaign {
  id: string; tenant_id: string | null; template_slug: string; subject_snapshot: string;
  total_recipients: number; sent_count: number; failed_count: number; skipped_count: number;
  status: string; created_at: string;
}
interface CampaignRecipient {
  id: string; branch_id: string | null; email: string | null;
  status: string; error: string | null; sent_at: string | null;
}

const TOKENS = ["branch_name", "contact_name", "store_url", "login_email", "action_link", "tenant_name", "portal_name"];

function renderPreview(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export default function PlatformCommunications() {
  const { toast } = useToast();
  const [tab, setTab] = useState("compose");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Communications</h1>
          <p className="text-sm text-muted-foreground">Send branded welcome emails and one-time logins to branches.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-6"><ComposeTab /></TabsContent>
        <TabsContent value="templates" className="mt-6"><TemplatesTab /></TabsContent>
        <TabsContent value="history" className="mt-6"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ComposeTab() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSlug, setTemplateSlug] = useState<string>("branch_welcome");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("tenants").select("id, name, slug").order("name");
      setTenants((t ?? []) as Tenant[]);
      const { data: tpl } = await supabase.from("platform_email_templates").select("*").order("name");
      setTemplates((tpl ?? []) as Template[]);
    })();
  }, []);

  useEffect(() => {
    if (!tenantId) { setBranches([]); setSelected(new Set()); return; }
    (async () => {
      const { data } = await supabase.from("branches")
        .select("id, name, email, trading_name")
        .eq("tenant_id", tenantId).eq("is_active", true).order("name");
      setBranches((data ?? []) as Branch[]);
      setSelected(new Set());
    })();
  }, [tenantId]);

  const template = templates.find(t => t.slug === templateSlug);
  const firstBranch = branches.find(b => selected.has(b.id)) ?? branches[0];
  const tenant = tenants.find(t => t.id === tenantId);

  const previewVars: Record<string, string> = {
    branch_name: firstBranch?.name ?? "Sample Branch",
    contact_name: firstBranch?.trading_name || firstBranch?.name || "there",
    store_url: tenant?.slug ? `https://document-centre.com/t/${tenant.slug}` : "https://example.com",
    login_email: firstBranch?.email ?? "branch@example.com",
    action_link: "https://example.com/reset-password?token=…",
    tenant_name: tenant?.name ?? "Your Tenant",
    portal_name: tenant?.name ?? "Your Portal",
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === branches.length) setSelected(new Set());
    else setSelected(new Set(branches.map(b => b.id)));
  };

  const send = async (dryRun: boolean) => {
    if (!tenantId || !templateSlug || selected.size === 0) {
      toast({ title: "Pick a tenant, template, and at least one branch", variant: "destructive" }); return;
    }
    setSending(true); setResult(null);
    const { data, error } = await supabase.functions.invoke("send-branch-welcome-campaign", {
      body: { tenant_id: tenantId, template_slug: templateSlug, branch_ids: Array.from(selected), dry_run: dryRun },
    });
    setSending(false);
    if (error) {
      toast({ title: dryRun ? "Dry run failed" : "Send failed", description: error.message, variant: "destructive" });
      return;
    }
    setResult(data);
    toast({
      title: dryRun ? "Dry run complete" : "Campaign sent",
      description: `Sent ${data.totals.sent} · Failed ${data.totals.failed} · Skipped ${data.totals.skipped}`,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Recipients</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tenant</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
              <SelectContent>
                {tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Template</Label>
            <Select value={templateSlug} onValueChange={setTemplateSlug}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {templates.map(t => <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {branches.length > 0 && (
            <div className="border rounded-md">
              <div className="flex items-center justify-between p-3 border-b bg-muted/40">
                <div className="flex items-center gap-2">
                  <Checkbox checked={selected.size === branches.length} onCheckedChange={toggleAll} />
                  <span className="text-sm font-medium">{selected.size} of {branches.length} selected</span>
                </div>
              </div>
              <div className="max-h-[400px] overflow-auto">
                {branches.map(b => (
                  <label key={b.id} className="flex items-start gap-3 p-3 border-b last:border-0 hover:bg-muted/30 cursor-pointer">
                    <Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggle(b.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{b.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {b.email ?? <span className="text-destructive">No email on file</span>}
                      </div>
                    </div>
                    {!b.email && <Badge variant="destructive" className="text-xs">Skipped</Badge>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => send(true)} disabled={sending || !selected.size}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Dry run
            </Button>
            <Button onClick={() => send(false)} disabled={sending || !selected.size}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send to {selected.size} branch{selected.size === 1 ? "" : "es"}
            </Button>
          </div>

          {result && (
            <div className="border rounded-md p-3 bg-muted/40 text-sm space-y-1 max-h-60 overflow-auto">
              <div className="font-medium">Results</div>
              {result.results?.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs border-b last:border-0 py-1">
                  <span className="truncate">{r.branch} {r.email ? `· ${r.email}` : ""}</span>
                  <Badge variant={r.status === "sent" || r.status === "dry_run_ok" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {template ? (
            <>
              <div className="text-xs text-muted-foreground">Subject</div>
              <div className="text-sm font-medium">{renderPreview(template.subject, previewVars)}</div>
              <div className="text-xs text-muted-foreground mt-3">Body</div>
              <div className="border rounded-md p-4 bg-white text-sm max-h-[500px] overflow-auto"
                   dangerouslySetInnerHTML={{ __html: renderPreview(template.body_html, previewVars) }} />
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                The action link is a one-time recovery link. Recipients land on /reset-password and must set a brand-new password before they can sign in.
              </div>
            </>
          ) : <div className="text-sm text-muted-foreground">Select a template.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function TemplatesTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [draft, setDraft] = useState<Partial<Template> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("platform_email_templates").select("*").order("name");
    setTemplates((data ?? []) as Template[]);
    if (!selectedSlug && data?.length) setSelectedSlug(data[0].slug);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = templates.find(x => x.slug === selectedSlug);
    if (t) setDraft({ ...t });
  }, [selectedSlug, templates]);

  const save = async () => {
    if (!draft?.id) return;
    setSaving(true);
    const { error } = await supabase.from("platform_email_templates").update({
      name: draft.name, subject: draft.subject, body_html: draft.body_html,
      body_text: draft.body_text, description: draft.description,
    }).eq("id", draft.id);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved" });
    load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Templates</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {templates.map(t => (
            <button key={t.slug} onClick={() => setSelectedSlug(t.slug)}
              className={`w-full text-left p-2 rounded text-sm ${selectedSlug === t.slug ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}>
              {t.name}
              {t.is_system && <Badge variant="outline" className="ml-2 text-xs">system</Badge>}
            </button>
          ))}
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader><CardTitle className="text-base">{draft.name}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={draft.name ?? ""} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={draft.subject ?? ""} onChange={e => setDraft({ ...draft, subject: e.target.value })} />
            </div>
            <div>
              <Label>HTML body</Label>
              <Textarea rows={14} className="font-mono text-xs"
                value={draft.body_html ?? ""} onChange={e => setDraft({ ...draft, body_html: e.target.value })} />
            </div>
            <div>
              <Label>Plain-text body (fallback)</Label>
              <Textarea rows={6} className="font-mono text-xs"
                value={draft.body_text ?? ""} onChange={e => setDraft({ ...draft, body_text: e.target.value })} />
            </div>
            <div className="text-xs text-muted-foreground">
              Merge tokens: {TOKENS.map(t => <code key={t} className="mx-1 px-1 bg-muted rounded">{`{{${t}}}`}</code>)}
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HistoryTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("platform_email_campaigns")
        .select("*").order("created_at", { ascending: false }).limit(50);
      setCampaigns((data ?? []) as Campaign[]);
    })();
  }, []);

  useEffect(() => {
    if (!selected) { setRecipients([]); return; }
    (async () => {
      const { data } = await supabase.from("platform_email_campaign_recipients")
        .select("*").eq("campaign_id", selected).order("created_at");
      setRecipients((data ?? []) as CampaignRecipient[]);
    })();
  }, [selected]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Campaigns</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-[600px] overflow-auto">
          {campaigns.length === 0 && <div className="text-sm text-muted-foreground">No campaigns yet.</div>}
          {campaigns.map(c => (
            <button key={c.id} onClick={() => setSelected(c.id)}
              className={`w-full text-left p-3 rounded border ${selected === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium truncate">{c.subject_snapshot}</div>
                <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                <span>Total: {c.total_recipients}</span>
                <span className="text-green-700">Sent: {c.sent_count}</span>
                {c.failed_count > 0 && <span className="text-red-700">Failed: {c.failed_count}</span>}
                {c.skipped_count > 0 && <span>Skipped: {c.skipped_count}</span>}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recipients</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-[600px] overflow-auto">
          {!selected && <div className="text-sm text-muted-foreground">Select a campaign.</div>}
          {recipients.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs p-2 border-b last:border-0">
              <span className="truncate">{r.email ?? "(no email)"}</span>
              <div className="flex items-center gap-2">
                {r.error && <span className="text-red-700 truncate max-w-[200px]" title={r.error}>{r.error}</span>}
                <Badge variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                  {r.status}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
