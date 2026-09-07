import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantCustomers } from "@/hooks/useTenantCustomers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Send, Save, Megaphone, AlertCircle, Plus, Trash2, Search, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { EmailPreviewFrame } from "@/components/admin/EmailPreviewFrame";
import { invokeEdgeFunctionVerbose } from "@/lib/invokeEdgeFunctionVerbose";
import { applyMergeTokens, renderEmailShell } from "@/lib/email/renderEmailPreview";

type Audience = "branch" | "company" | "customer";

interface Recipient {
  id: string;
  name: string;
  email: string | null;
  secondary?: string | null;
}

interface TenantTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  subject: string;
  body_html: string;
  body_text: string | null;
  tenant_id: string | null;
  kind: string | null;
}

interface CampaignRow {
  id: string;
  template_slug: string;
  subject_snapshot: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  status: string;
  created_at: string;
  audience: string | null;
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  branch: "Branches",
  company: "Businesses",
  customer: "Customers",
};

const TOKENS = [
  "contact_name", "customer_name", "company_name", "branch_name",
  "tenant_name", "activation_link", "action_link", "unsubscribe_link",
];

export default function AdminCommunications() {
  const [tab, setTab] = useState("compose");
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Communications</h1>
          <p className="text-xs text-muted-foreground">
            Send branded emails with personal sign-in links to your branches, businesses and customers.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-4"><ComposeTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compose
// ─────────────────────────────────────────────────────────────
function ComposeTab() {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const { data: customers } = useTenantCustomers();

  const [tenantName, setTenantName] = useState("Your storefront");
  const [audience, setAudience] = useState<Audience>("branch");
  const [templates, setTemplates] = useState<TenantTemplate[]>([]);
  const [templateSlug, setTemplateSlug] = useState("");
  const [branches, setBranches] = useState<Recipient[]>([]);
  const [companies, setCompanies] = useState<Recipient[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data: t } = await supabase
        .from("tenants").select("name").eq("id", tenantId).maybeSingle();
      if (t?.name) setTenantName(t.name);

      const { data: tpl } = await supabase
        .from("platform_email_templates" as any)
        .select("*")
        .eq("kind", "marketing")
        .order("name");
      const rows = ((tpl ?? []) as unknown) as TenantTemplate[];
      setTemplates(rows);
      if (rows.length && !templateSlug) setTemplateSlug(rows[0].slug);

      const { data: b } = await supabase
        .from("branches").select("id, name, email, trading_name")
        .eq("tenant_id", tenantId).eq("is_active", true).order("name");
      setBranches(((b ?? []) as any[]).map((r) => ({
        id: r.id, name: r.name, email: r.email, secondary: r.trading_name,
      })));

      const { data: c } = await supabase
        .from("customer_companies").select("id, name, trading_name, email")
        .eq("tenant_id", tenantId).order("name");
      setCompanies(((c ?? []) as any[]).map((r) => ({
        id: r.id, name: r.trading_name || r.name, email: r.email,
      })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const customerRecipients: Recipient[] = useMemo(() => (customers ?? []).map((c) => ({
    id: c.profile_id,
    name: c.display_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Customer",
    email: c.email,
    secondary: c.is_trade_customer ? "Trade" : null,
  })), [customers]);

  const pool: Recipient[] = audience === "branch" ? branches
    : audience === "company" ? companies
    : customerRecipients;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((r) =>
      r.name.toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q));
  }, [pool, search]);

  useEffect(() => { setSelected(new Set()); setResult(null); }, [audience]);

  const template = templates.find((t) => t.slug === templateSlug);
  const sample = pool.find((r) => selected.has(r.id)) ?? pool[0];

  const previewVars: Record<string, string> = {
    branch_name: sample?.name ?? "Sample recipient",
    company_name: sample?.name ?? "Sample business",
    customer_name: sample?.name ?? "there",
    contact_name: sample?.name ?? "there",
    tenant_name: tenantName,
    activation_link: "https://example.com/activate/sample-slug",
    action_link: "https://example.com/activate/sample-slug",
    unsubscribe_link: "https://example.com/unsubscribe",
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (filtered.every((r) => selected.has(r.id))) {
      const next = new Set(selected);
      filtered.forEach((r) => next.delete(r.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((r) => next.add(r.id));
      setSelected(next);
    }
  };

  const send = async (dryRun: boolean) => {
    if (!tenantId || !templateSlug || selected.size === 0) {
      toast({ title: "Pick a template and at least one recipient", variant: "destructive" });
      return;
    }
    setSending(true); setResult(null);
    const response = await invokeEdgeFunctionVerbose("send-branch-marketing-campaign", {
      tenant_id: tenantId,
      template_slug: templateSlug,
      audience,
      recipient_ids: Array.from(selected),
      dry_run: dryRun,
    });
    setSending(false);
    if (!response.ok || !response.data) {
      if (response.data) setResult(response.data);
      toast({
        title: dryRun ? "Dry run failed" : "Send failed",
        description: response.error ?? "No response from the email sender",
        variant: "destructive",
      });
      return;
    }
    const data = response.data as any;
    const totals = data.totals ?? {};
    setResult(data);
    toast({
      title: dryRun ? "Dry run complete" : data.queued ? "Campaign queued" : "Campaign sent",
      description: dryRun
        ? `Ready ${totals.dry_run_ok ?? 0} · Failed ${totals.failed ?? 0} · Skipped ${totals.skipped ?? 0}`
        : `Sending ${totals.sent ?? totals.pending ?? 0} · Failed ${totals.failed ?? 0} · Skipped ${totals.skipped ?? 0}`,
    });
  };

  const noSender = (result?.results ?? []).some(
    (r: any) => typeof r.error === "string" && r.error.includes("No outgoing email account"),
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Recipients</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Send to</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
                <button key={a} type="button" onClick={() => setAudience(a)}
                  className={`border rounded-md p-2 text-sm ${audience === a ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/40"}`}>
                  {AUDIENCE_LABEL[a]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Template</Label>
            <Select value={templateSlug} onValueChange={setTemplateSlug}>
              <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>
                    {t.name}{t.tenant_id ? "" : " (shared)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!templates.length && (
              <p className="text-xs text-muted-foreground mt-1">
                No templates yet — create one on the Templates tab.
              </p>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder={`Search ${AUDIENCE_LABEL[audience].toLowerCase()}…`}
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="border rounded-md">
            <div className="flex items-center justify-between p-3 border-b bg-muted/40">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                  onCheckedChange={toggleAll}
                />
                <span className="text-sm font-medium">
                  {selected.size} selected · {filtered.length} shown
                </span>
              </div>
            </div>
            <div className="max-h-[360px] overflow-auto">
              {filtered.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground text-center">Nothing to show.</div>
              )}
              {filtered.map((r) => (
                <label key={r.id} className="flex items-start gap-3 p-3 border-b last:border-0 hover:bg-muted/30 cursor-pointer">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.email ?? <span className="text-destructive">No email on file</span>}
                    </div>
                  </div>
                  {r.secondary && <Badge variant="secondary" className="text-xs">{r.secondary}</Badge>}
                  {!r.email && <Badge variant="destructive" className="text-xs">Skipped</Badge>}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => send(true)} disabled={sending || !selected.size}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Dry run
            </Button>
            <Button onClick={() => send(false)} disabled={sending || !selected.size}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send to {selected.size}
            </Button>
          </div>

          {noSender && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">No outgoing email account</div>
                <div>Connect your sending mailbox under Settings → Email Accounts, then send again.</div>
              </div>
            </div>
          )}

          {result && (
            <div className="border rounded-md p-3 bg-muted/40 text-sm space-y-2 max-h-72 overflow-auto">
              <div className="font-medium">Results</div>
              {(result.results ?? []).map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs border-b last:border-0 py-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.branch}{r.email ? ` · ${r.email}` : ""}</span>
                    {r.error && <span className="block truncate text-destructive" title={r.error}>{r.error}</span>}
                  </span>
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
        <CardContent>
          {template ? (
            <EmailPreviewFrame
              subject={applyMergeTokens(template.subject, previewVars)}
              html={renderEmailShell({
                portalName: tenantName,
                bodyHtml: applyMergeTokens(template.body_html, previewVars),
              })}
              note={
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  Each recipient gets their own personal link merged into {"{{activation_link}}"}, plus an
                  unsubscribe footer. Anyone who has opted out is skipped automatically.
                </div>
              }
            />
          ) : <div className="text-sm text-muted-foreground">Select a template.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Templates (tenant-owned only; shared platform ones are read-only)
// ─────────────────────────────────────────────────────────────
function slugify(name: string, tenantId: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "template";
  return `${base}-${tenantId.slice(0, 6)}`;
}

function TemplatesTab() {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [templates, setTemplates] = useState<TenantTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Partial<TenantTemplate> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("platform_email_templates" as any)
      .select("*").eq("kind", "marketing").order("name");
    const rows = ((data ?? []) as unknown) as TenantTemplate[];
    setTemplates(rows);
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  useEffect(() => {
    const t = templates.find((x) => x.id === selectedId);
    setDraft(t ? { ...t } : null);
  }, [selectedId, templates]);

  const readOnly = !!draft && !draft.tenant_id;

  const createTemplate = async (from?: TenantTemplate) => {
    if (!tenantId) return;
    const name = from ? `${from.name} (copy)` : "New campaign";
    const { data, error } = await supabase
      .from("platform_email_templates" as any)
      .insert({
        tenant_id: tenantId,
        slug: slugify(`${name}-${Date.now().toString(36)}`, tenantId),
        name,
        kind: "marketing",
        subject: from?.subject ?? "A quick note from {{tenant_name}}",
        body_html: from?.body_html ?? "<p>Hi {{contact_name}},</p><p>Write your message here.</p><p><a href=\"{{activation_link}}\">Open your account</a></p>",
        body_text: from?.body_text ?? null,
        is_system: false,
      } as any)
      .select("id").single();
    if (error) { toast({ title: "Could not create template", description: error.message, variant: "destructive" }); return; }
    await load();
    setSelectedId((data as any).id);
  };

  const save = async () => {
    if (!draft?.id || readOnly) return;
    setSaving(true);
    const { error } = await supabase
      .from("platform_email_templates" as any)
      .update({
        name: draft.name,
        description: draft.description ?? null,
        subject: draft.subject,
        body_html: draft.body_html,
        body_text: draft.body_text ?? null,
      } as any)
      .eq("id", draft.id);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Template saved" });
    load();
  };

  const remove = async () => {
    if (!draft?.id || readOnly) return;
    if (!window.confirm("Delete this template?")) return;
    const { error } = await supabase.from("platform_email_templates" as any).delete().eq("id", draft.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    setSelectedId(""); await load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Templates</CardTitle>
          <Button size="sm" variant="outline" onClick={() => createTemplate()}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => setSelectedId(t.id)}
              className={`w-full text-left px-4 py-3 border-b last:border-0 text-sm ${selectedId === t.id ? "bg-primary/5 font-medium" : "hover:bg-muted/40"}`}>
              <div className="truncate">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.tenant_id ? "Yours" : "Shared (read-only)"}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{draft?.name ?? "Select a template"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!draft && <div className="text-sm text-muted-foreground">Pick a template on the left, or create a new one.</div>}
          {draft && (
            <>
              {readOnly && (
                <div className="rounded border bg-muted/40 p-2 text-xs flex items-center justify-between gap-2">
                  <span>This is a shared template. Duplicate it to make your own version.</span>
                  <Button size="sm" variant="outline"
                    onClick={() => createTemplate(templates.find((t) => t.id === draft.id))}>
                    Duplicate
                  </Button>
                </div>
              )}
              <div>
                <Label>Name</Label>
                <Input value={draft.name ?? ""} disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <Label>Subject</Label>
                <Input value={draft.subject ?? ""} disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
              <div>
                <Label>Message</Label>
                <RichTextEditor
                  value={draft.body_html ?? ""}
                  onChange={(html) => setDraft({ ...draft, body_html: html })}
                />
              </div>
              <div>
                <Label>Plain-text version (optional)</Label>
                <Textarea rows={4} value={draft.body_text ?? ""} disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, body_text: e.target.value })} />
              </div>
              <div className="text-xs text-muted-foreground">
                Personalisation tokens: {TOKENS.map((t) => `{{${t}}}`).join(" · ")}
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <Button onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save
                  </Button>
                  <Button variant="outline" onClick={remove}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────
function HistoryTab() {
  const { tenantId } = useTenantContext();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("platform_email_campaigns" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    setRows(((data ?? []) as unknown) as CampaignRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Recent campaigns</CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No campaigns sent yet.</div>
        )}
        {rows.map((c) => (
          <div key={c.id} className="px-4 py-3 border-b last:border-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{c.subject_snapshot}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(c.created_at).toLocaleString()} · {AUDIENCE_LABEL[(c.audience as Audience) ?? "branch"] ?? "Branches"}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs shrink-0">
              <Badge variant="default">{c.sent_count} sent</Badge>
              {c.failed_count > 0 && <Badge variant="destructive">{c.failed_count} failed</Badge>}
              {c.skipped_count > 0 && <Badge variant="secondary">{c.skipped_count} skipped</Badge>}
              <Badge variant="outline">{c.status}</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
