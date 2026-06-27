import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Send, Save, Megaphone, AlertCircle, Code2, Plus, Copy, Trash2, Eye, MousePointerClick, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { EmailPreviewFrame } from "@/components/admin/EmailPreviewFrame";
import {
  applyMergeTokens, defaultPreviewVars, renderEmailShell,
} from "@/lib/email/renderEmailPreview";

interface Tenant { id: string; name: string; slug: string | null; custom_domain: string | null; }
interface Branch { id: string; name: string; email: string | null; trading_name: string | null; }
interface Template {
  id: string; slug: string; name: string; description: string | null;
  subject: string; body_html: string; body_text: string | null; is_system: boolean;
  kind?: "activation" | "marketing" | null;
}
interface Campaign {
  id: string; tenant_id: string | null; template_slug: string; subject_snapshot: string;
  total_recipients: number; sent_count: number; failed_count: number; skipped_count: number;
  status: string; created_at: string; kind?: "activation" | "marketing" | null;
}
interface CampaignRecipient {
  id: string; branch_id: string | null; email: string | null;
  status: string; error: string | null; sent_at: string | null;
}

const TOKENS_ACTIVATION = ["branch_name", "contact_name", "store_url", "login_email", "action_link", "tenant_name", "portal_name"];
const TOKENS_MARKETING = ["branch_name", "contact_name", "tenant_name", "activation_link"];

export default function PlatformCommunications() {
  const { toast } = useToast();
  const [tab, setTab] = useState("compose");

  const isTemplates = tab === "templates";
  return (
    <div className={`py-4 space-y-4 ${isTemplates ? "px-4" : "px-6 max-w-7xl mx-auto"}`}>
      <div className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Communications</h1>
          <p className="text-xs text-muted-foreground">Send branded welcome emails and one-time logins to branches.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="triggers">Triggers</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-4"><ComposeTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="triggers" className="mt-4"><TriggersTab /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ComposeTab() {
  const { toast } = useToast();
  const [kind, setKind] = useState<"marketing" | "activation">("marketing");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSlug, setTemplateSlug] = useState<string>("marketing_branch_offer");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("tenants").select("id, name, slug, custom_domain").order("name");
      setTenants((t ?? []) as Tenant[]);
      const { data: tpl } = await supabase.from("platform_email_templates").select("*").order("name");
      setTemplates((tpl ?? []) as Template[]);
    })();
  }, []);

  // When kind changes, swap default template
  useEffect(() => {
    const first = templates.find(t => (t.kind ?? "activation") === kind);
    if (first) setTemplateSlug(first.slug);
  }, [kind, templates]);

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

  const filteredTemplates = templates.filter(t => (t.kind ?? "activation") === kind);
  const template = templates.find(t => t.slug === templateSlug);
  const firstBranch = branches.find(b => selected.has(b.id)) ?? branches[0];
  const tenant = tenants.find(t => t.id === tenantId);

  const previewVars: Record<string, string> = {
    branch_name: firstBranch?.name ?? "Sample Branch",
    contact_name: firstBranch?.trading_name || firstBranch?.name || "there",
    store_url: tenant?.custom_domain
      ? `https://${tenant.custom_domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`
      : tenant?.slug ? `https://document-centre.com/t/${tenant.slug}` : "https://example.com",
    login_email: firstBranch?.email ?? "branch@example.com",
    action_link: "https://example.com/welcome?token=…",
    activation_link: tenant?.custom_domain
      ? `https://${tenant.custom_domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}/activate/sample-slug`
      : "https://example.com/activate/sample-slug",
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
    const fn = kind === "marketing" ? "send-branch-marketing-campaign" : "send-branch-welcome-campaign";
    const { data, error } = await supabase.functions.invoke(fn, {
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
            <Label>Campaign type</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button type="button" onClick={() => setKind("marketing")}
                className={`text-left border rounded-md p-3 text-xs ${kind === "marketing" ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                <div className="font-medium text-sm">Marketing pitch</div>
                <div className="text-muted-foreground mt-1">No credentials. Sends a sales email with a per-branch activation link. The branch self-requests their sign-in email.</div>
              </button>
              <button type="button" onClick={() => setKind("activation")}
                className={`text-left border rounded-md p-3 text-xs ${kind === "activation" ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                <div className="font-medium text-sm">Direct activation</div>
                <div className="text-muted-foreground mt-1">Sends the secure sign-in link directly. Use when you've already spoken to the branch.</div>
              </button>
            </div>
          </div>
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
                {filteredTemplates.map(t => <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>)}
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
        <CardContent>
          {template ? (
            <EmailPreviewFrame
              subject={applyMergeTokens(template.subject, previewVars)}
              html={renderEmailShell({
                portalName: tenant?.name ?? "Document Centre",
                bodyHtml: applyMergeTokens(template.body_html, previewVars),
              })}
              note={
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  {kind === "marketing"
                    ? "Marketing pitch — no credentials are sent. Recipients land on /activate/<slug> and request the sign-in email themselves."
                    : "The action link is a one-time sign-in link, valid for 1 hour. Recipients land on /welcome and must set a brand-new password before they can sign in."}
                </div>
              }
            />
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
  const [rawMode, setRawMode] = useState(false);
  const [tokenTarget, setTokenTarget] = useState<"body" | "text">("body");
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const htmlRef = useRef<HTMLTextAreaElement | null>(null);

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

  const tokens = useMemo(
    () => (draft?.kind === "marketing" ? TOKENS_MARKETING : TOKENS_ACTIVATION),
    [draft?.kind],
  );

  const insertTokenIntoTextarea = (
    ref: React.RefObject<HTMLTextAreaElement>,
    field: "body_text" | "body_html",
    token: string,
  ) => {
    const el = ref.current;
    const snippet = `{{${token}}}`;
    if (!el || !draft) {
      setDraft({ ...draft, [field]: `${(draft as any)?.[field] ?? ""}${snippet}` } as any);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + snippet + el.value.slice(end);
    setDraft({ ...draft, [field]: next } as any);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };


  const previewVars = defaultPreviewVars();
  const previewHtml = draft?.body_html
    ? renderEmailShell({
        portalName: "Document Centre",
        bodyHtml: applyMergeTokens(draft.body_html, previewVars),
      })
    : "";

  const handleTokenClick = (token: string) => {
    if (tokenTarget === "text") return insertTokenIntoTextarea(textRef, "body_text", token);
    if (rawMode) return insertTokenIntoTextarea(htmlRef, "body_html", token);
    setDraft({ ...(draft ?? {}), body_html: `${draft?.body_html ?? ""}{{${token}}}` });
  };

  return (
    <div className="border rounded-lg bg-card overflow-hidden h-[calc(100vh-12rem)] min-h-[560px] flex flex-col">
      {/* Mobile/narrow: template picker */}
      <div className="lg:hidden border-b p-2">
        <Select value={selectedSlug} onValueChange={setSelectedSlug}>
          <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
          <SelectContent>
            {templates.map(t => (
              <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] divide-x">
        {/* Templates list */}
        <div className="hidden lg:flex flex-col min-h-0">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">Templates</div>
          <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
            {templates.map(t => (
              <button key={t.slug} onClick={() => setSelectedSlug(t.slug)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm ${selectedSlug === t.slug ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}>
                <div className="truncate">{t.name}</div>
                {t.is_system && <Badge variant="outline" className="mt-0.5 text-[10px] h-4 px-1">system</Badge>}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        {draft ? (
          <div className="flex flex-col min-h-0">
            {/* Sticky toolbar */}
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-b bg-muted/30">
              <div className="text-sm font-medium truncate">{draft.name}</div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Code2 className="h-3.5 w-3.5" />
                  Raw HTML
                  <Switch checked={rawMode} onCheckedChange={setRawMode} />
                </label>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Save
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={draft.name ?? ""} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input value={draft.subject ?? ""} onChange={e => setDraft({ ...draft, subject: e.target.value })} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Email body</Label>
                {rawMode ? (
                  <Textarea ref={htmlRef} rows={14} className="font-mono text-xs"
                    value={draft.body_html ?? ""}
                    onChange={e => setDraft({ ...draft, body_html: e.target.value })} />
                ) : (
                  <RichTextEditor
                    value={draft.body_html ?? ""}
                    onChange={(html) => setDraft({ ...draft, body_html: html })}
                  />
                )}
              </div>

              <div>
                <Label className="text-xs">Plain-text body (fallback)</Label>
                <Textarea ref={textRef} rows={5} className="font-mono text-xs"
                  value={draft.body_text ?? ""} onChange={e => setDraft({ ...draft, body_text: e.target.value })} />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                <span className="text-xs text-muted-foreground">Insert token into</span>
                <div className="flex items-center gap-0.5 border rounded-md p-0.5">
                  <button type="button" onClick={() => setTokenTarget("body")}
                    className={`px-2 py-0.5 text-xs rounded ${tokenTarget === "body" ? "bg-secondary" : "hover:bg-muted"}`}>
                    Body
                  </button>
                  <button type="button" onClick={() => setTokenTarget("text")}
                    className={`px-2 py-0.5 text-xs rounded ${tokenTarget === "text" ? "bg-secondary" : "hover:bg-muted"}`}>
                    Plain-text
                  </button>
                </div>
                {tokens.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTokenClick(t)}
                    className="px-2 py-0.5 rounded bg-muted hover:bg-muted/70 font-mono text-[11px] border"
                    title={`Insert {{${t}}}`}
                  >
                    {`{{${t}}}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center text-sm text-muted-foreground p-6">
            Select a template
          </div>
        )}

        {/* Live preview */}
        {draft && (
          <div className="flex flex-col min-h-0 bg-background">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
              Live preview
            </div>
            <div className="flex-1 min-h-0 p-3">
              <EmailPreviewFrame
                fill
                subject={applyMergeTokens(draft.subject ?? "", previewVars)}
                html={previewHtml}
              />
            </div>
          </div>
        )}
      </div>
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
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{c.subject_snapshot}</div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.kind && <Badge variant="outline" className="text-[10px]">{c.kind}</Badge>}
                  <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</div>
                </div>
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
