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
import { Loader2, Send, Save, Megaphone, AlertCircle, Code2, Plus, Copy, Trash2, Eye, MousePointerClick, CheckCircle2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { EmailPreviewFrame } from "@/components/admin/EmailPreviewFrame";
import { invokeEdgeFunctionVerbose } from "@/lib/invokeEdgeFunctionVerbose";
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
  first_opened_at?: string | null; open_count?: number;
  first_clicked_at?: string | null; click_count?: number;
  last_clicked_url?: string | null; activated_at?: string | null;
}
interface RetryCampaignResponse {
  totals?: { pending?: number };
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
          <TabsTrigger value="nudges">Nudges</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-4"><ComposeTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="triggers" className="mt-4"><TriggersTab /></TabsContent>
        <TabsContent value="nudges" className="mt-4"><NudgesTab /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Nudges: platform-controlled toggles + timing offsets for
// automated system emails (trial expiry, past-due, cancelled,
// onboarding stalled). Copy stays in the edge function.
// ─────────────────────────────────────────────────────────────
interface NudgeSetting {
  nudge_key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  offsets_days: number[];
  updated_at: string;
}

function NudgesTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<NudgeSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("platform_nudge_settings" as any)
      .select("*")
      .order("label");
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setRows(((data ?? []) as unknown) as NudgeSetting[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const parseOffsets = (s: string): number[] | null => {
    const parts = s.split(",").map(x => x.trim()).filter(Boolean);
    const nums: number[] = [];
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isInteger(n) || n < 0 || n > 365) return null;
      if (!nums.includes(n)) nums.push(n);
    }
    return nums;
  };

  const toggleEnabled = async (row: NudgeSetting, enabled: boolean) => {
    setSaving(row.nudge_key);
    const { error } = await supabase
      .from("platform_nudge_settings" as any)
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("nudge_key", row.nudge_key);
    setSaving(null);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setRows(rs => rs.map(r => r.nudge_key === row.nudge_key ? { ...r, enabled } : r));
    toast({ title: enabled ? "Enabled" : "Disabled", description: row.label });
  };

  const saveOffsets = async (row: NudgeSetting) => {
    const raw = drafts[row.nudge_key] ?? row.offsets_days.join(", ");
    const parsed = parseOffsets(raw);
    if (!parsed) {
      toast({ title: "Invalid offsets", description: "Enter comma-separated whole numbers (0–365).", variant: "destructive" });
      return;
    }
    setSaving(row.nudge_key);
    const { error } = await supabase
      .from("platform_nudge_settings" as any)
      .update({ offsets_days: parsed, updated_at: new Date().toISOString() })
      .eq("nudge_key", row.nudge_key);
    setSaving(null);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setRows(rs => rs.map(r => r.nudge_key === row.nudge_key ? { ...r, offsets_days: parsed } : r));
    setDrafts(d => { const n = { ...d }; delete n[row.nudge_key]; return n; });
    toast({ title: "Saved", description: `${row.label}: ${parsed.join(", ")} days` });
  };

  const runNow = async () => {
    setRunning(true);
    const response = await invokeEdgeFunctionVerbose("nudge-dispatcher", {});
    setRunning(false);
    if (!response.ok) {
      toast({ title: "Run failed", description: response.error ?? "Dispatcher error", variant: "destructive" });
      return;
    }
    const d = response.data as any;
    toast({ title: "Dispatcher run complete", description: `Sent ${d?.sent ?? 0} · Skipped ${d?.skipped ?? 0} · Errors ${d?.errors?.length ?? 0}` });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">System email nudges</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Platform-controlled reminders sent automatically to branch owners and admins.
              Offsets are days <em>before</em> the event (expiring, grace end) or <em>after</em> the event (expired, cancelled, onboarding started).
              Runs hourly.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
            {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Run now
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!loading && rows.map(row => {
            const draft = drafts[row.nudge_key] ?? row.offsets_days.join(", ");
            const dirty = draft !== row.offsets_days.join(", ");
            return (
              <div key={row.nudge_key} className="border rounded-md p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Switch checked={row.enabled} onCheckedChange={(v) => toggleEnabled(row, v)} disabled={saving === row.nudge_key} />
                      <span className="text-sm font-medium">{row.label}</span>
                      {!row.enabled && <Badge variant="secondary" className="text-xs">Off</Badge>}
                    </div>
                    {row.description && <p className="text-xs text-muted-foreground mt-1">{row.description}</p>}
                  </div>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Offsets (days, comma-separated)</Label>
                    <Input
                      value={draft}
                      onChange={(e) => setDrafts(d => ({ ...d, [row.nudge_key]: e.target.value }))}
                      placeholder="e.g. 7, 3, 1"
                      className="mt-1"
                    />
                  </div>
                  <Button size="sm" onClick={() => saveOffsets(row)} disabled={!dirty || saving === row.nudge_key}>
                    {saving === row.nudge_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
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
  const [existingPagesCount, setExistingPagesCount] = useState<number>(0);

  // Count how many selected branches already have an activation page
  useEffect(() => {
    if (kind !== "marketing" || selected.size === 0) { setExistingPagesCount(0); return; }
    const ids = Array.from(selected);
    (async () => {
      const { count } = await supabase
        .from("platform_branch_activation_pages")
        .select("id", { count: "exact", head: true })
        .in("branch_id", ids);
      setExistingPagesCount(count ?? 0);
    })();
  }, [kind, selected]);

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

  const describeSendFailure = (data: any, fallback: string | null) => {
    const requested = data?.requested_count ?? selected.size;
    const found = data?.found_count;
    const missing = Array.isArray(data?.missing_branch_ids) ? data.missing_branch_ids.length : undefined;
    const bits = [fallback || "The email sender could not complete the request."];
    if (requested !== undefined) bits.push(`Requested: ${requested}`);
    if (found !== undefined) bits.push(`Matched: ${found}`);
    if (missing !== undefined) bits.push(`Missing: ${missing}`);
    return bits.join(" · ");
  };

  const copyText = async (value: string, label = "Copied") => {
    await navigator.clipboard.writeText(value);
    toast({ title: label });
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
    if (kind === "marketing" && template && !/\{\{\s*activation_link\s*\}\}/.test(template.body_html ?? "")) {
      const ok = window.confirm(
        "This marketing template doesn't include {{activation_link}}. Recipients won't get an activation URL. Send anyway?"
      );
      if (!ok) return;
    }
    setSending(true); setResult(null);
    const selectedCount = selected.size;
    const fn = kind === "marketing" ? "send-branch-marketing-campaign" : "send-branch-welcome-campaign";
    const response = await invokeEdgeFunctionVerbose(fn, {
      tenant_id: tenantId,
      template_slug: templateSlug,
      branch_ids: Array.from(selected),
      dry_run: dryRun,
    });
    setSending(false);
    if (!response.ok || !response.data) {
      if (response.data) setResult(response.data);
      toast({
        title: dryRun ? "Dry run failed" : "Send failed",
        description: describeSendFailure(response.data, response.error ?? "No response from email sender"),
        variant: "destructive",
      });
      return;
    }
    const data = response.data as any;
    const totals = data.totals ?? { sent: 0, failed: 0, skipped: 0, dry_run_ok: 0 };
    const resolvedTotal = Number(totals.sent ?? 0) + Number(totals.failed ?? 0) + Number(totals.skipped ?? 0) + Number(totals.dry_run_ok ?? 0) + Number(totals.pending ?? 0);
    if (selectedCount > 0 && resolvedTotal === 0) {
      setResult(data);
      toast({
        title: dryRun ? "Dry run found no recipients" : "Send found no recipients",
        description: describeSendFailure(data, "No selected branches were matched by the sender."),
        variant: "destructive",
      });
      return;
    }
    setResult(data);
    if (!dryRun && data.queued) {
      toast({
        title: "Campaign queued",
        description: `${totals.pending ?? 0} email(s) sending in the background. Refresh the campaign card to see progress.`,
      });
    } else {
      toast({
        title: dryRun ? "Dry run complete" : "Campaign sent",
        description: dryRun
          ? `Ready ${totals.dry_run_ok ?? 0} · Failed ${totals.failed} · Skipped ${totals.skipped}`
          : `Sent ${totals.sent} · Failed ${totals.failed} · Skipped ${totals.skipped}`,
      });
    }
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

          {kind === "marketing" && selected.size > 0 && (
            <div className="text-xs border rounded-md p-2 bg-muted/30 text-muted-foreground">
              {existingPagesCount >= selected.size ? (
                <>All {selected.size} selected branches already have activation pages — links will be reused.</>
              ) : (
                <>
                  {existingPagesCount} of {selected.size} selected branches already have activation pages.{" "}
                  {selected.size - existingPagesCount} new page{selected.size - existingPagesCount === 1 ? "" : "s"} will be created automatically at send time and merged into <code className="font-mono">{"{{activation_link}}"}</code>.
                </>
              )}
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
            <div className="border rounded-md p-3 bg-muted/40 text-sm space-y-2 max-h-72 overflow-auto">
              <div className="font-medium">Results</div>
              {(result.results ?? []).some((r: any) => typeof r.error === "string" && r.error.includes("Platform sender mailbox not configured")) && (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium">Platform sender not configured</div>
                    <div className="mt-0.5">Activation emails send from the Document Centre platform mailbox, not the branch. Connect one under Platform → Settings → Email, then re-send.</div>
                    <a href="/platform/settings?tab=email" className="underline mt-1 inline-block">Open Platform Email settings</a>
                  </div>
                </div>
              )}
              {result.results?.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs border-b last:border-0 py-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.branch} {r.email ? `· ${r.email}` : ""}</span>
                    {r.error && <span className="block truncate text-destructive" title={r.error}>{r.error}</span>}
                    {r.activation_link && (
                      <span className="mt-1 flex items-center gap-1 min-w-0 text-muted-foreground">
                        <a className="truncate underline" href={r.activation_link} target="_blank" rel="noreferrer">
                          {r.activation_link}
                        </a>
                        <button
                          type="button"
                          className="shrink-0 rounded-sm p-1 hover:bg-muted"
                          title="Copy activation link"
                          onClick={() => copyText(r.activation_link, "Activation link copied")}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </span>
                  <Badge variant={r.status === "sent" || r.status === "dry_run_ok" ? "default" : r.status === "failed" || String(r.status).startsWith("skipped_branch") ? "destructive" : "secondary"}>
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
                    ? "Marketing pitch — the preview uses a sample activation URL. Dry run or send creates/reuses each branch’s real /activate/<slug> link and merges it into {{activation_link}}."
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
          <div className="flex items-center justify-between px-3 py-1.5 border-b">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Templates</span>
            <NewTemplateButton onCreated={(slug) => { load().then(() => setSelectedSlug(slug)); }} />
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
            {templates.map(t => (
              <div key={t.slug}
                className={`group flex items-center rounded ${selectedSlug === t.slug ? "bg-primary/10" : "hover:bg-muted"}`}>
                <button onClick={() => setSelectedSlug(t.slug)}
                  className={`flex-1 text-left px-2 py-1.5 text-sm ${selectedSlug === t.slug ? "font-medium" : ""}`}>
                  <div className="truncate">{t.name}</div>
                  {t.is_system && <Badge variant="outline" className="mt-0.5 text-[10px] h-4 px-1">system</Badge>}
                </button>
                <TemplateRowActions
                  template={t}
                  onChange={() => load()}
                  onDeleted={() => { setSelectedSlug(""); load(); }}
                />
              </div>
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

              {draft.kind === "marketing" && (
                <div className="text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-900 p-2 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Drop <code className="font-mono">{"{{activation_link}}"}</code> anywhere in the body. At send time each recipient gets a unique per-branch activation URL (auto-created if one doesn't exist yet) — no CSV or external merge required.
                  </span>
                </div>
              )}


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
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadCampaigns = async () => {
    const { data } = await supabase.from("platform_email_campaigns")
      .select("*").order("created_at", { ascending: false }).limit(50);
    setCampaigns((data ?? []) as Campaign[]);
  };

  const loadRecipients = async (campaignId: string) => {
    const { data } = await supabase.from("platform_email_campaign_recipients")
      .select("*").eq("campaign_id", campaignId).order("created_at");
    setRecipients((data ?? []) as CampaignRecipient[]);
  };

  useEffect(() => { loadCampaigns(); }, []);

  useEffect(() => {
    if (!selected) { setRecipients([]); return; }
    loadRecipients(selected);
  }, [selected]);

  useEffect(() => {
    const hasRunning = campaigns.some(c => c.status === "running");
    if (!hasRunning && !selected) return;
    const t = window.setInterval(() => {
      loadCampaigns();
      if (selected) loadRecipients(selected);
    }, 10000);
    return () => window.clearInterval(t);
  }, [campaigns, selected]);

  const retryFailed = async (campaignId: string) => {
    setRetrying(campaignId);
    const response = await invokeEdgeFunctionVerbose("send-branch-marketing-campaign", {
      retry_failed: true,
      retry_campaign_id: campaignId,
    });
    setRetrying(null);
    if (!response.ok) {
      toast({ title: "Retry failed", description: response.error ?? "Could not queue retry", variant: "destructive" });
      return;
    }
    const totals = (response.data as RetryCampaignResponse | null)?.totals ?? {};
    toast({ title: "Retry queued", description: `${totals.pending ?? 0} recipient(s) will be re-enqueued.` });
    await loadCampaigns();
    if (selected === campaignId) await loadRecipients(campaignId);
  };

  const stats = useMemo(() => {
    const sent = recipients.filter(r => r.status === "sent" || r.status === "sent_existing_user" || r.status === "completed").length;
    const opened = recipients.filter(r => !!r.first_opened_at).length;
    const clicked = recipients.filter(r => !!r.first_clicked_at).length;
    const activated = recipients.filter(r => !!r.activated_at || r.status === "completed").length;
    const pct = (n: number) => sent ? Math.round((n / sent) * 100) : 0;
    return { sent, opened, clicked, activated, openRate: pct(opened), clickRate: pct(clicked), actRate: pct(activated) };
  }, [recipients]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Campaigns</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-[600px] overflow-auto">
          {campaigns.length === 0 && <div className="text-sm text-muted-foreground">No campaigns yet.</div>}
          {campaigns.map(c => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(c.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(c.id); }}
              className={`w-full text-left p-3 rounded border cursor-pointer ${selected === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{c.subject_snapshot}</div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.kind && <Badge variant="outline" className="text-[10px]">{c.kind}</Badge>}
                  <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                <span>Total: {c.total_recipients}</span>
                <span className="text-green-700">Queued: {c.sent_count}</span>
                {c.failed_count > 0 && <span className="text-red-700">Failed: {c.failed_count}</span>}
                {c.skipped_count > 0 && <span>Skipped: {c.skipped_count}</span>}
                <Badge variant={c.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                  {c.status}
                </Badge>
                {c.failed_count > 0 && c.kind === "marketing" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={(e) => { e.stopPropagation(); retryFailed(c.id); }}
                    disabled={retrying === c.id}
                  >
                    {retrying === c.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                    Retry failed
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recipients</CardTitle></CardHeader>
        <CardContent className="space-y-3 max-h-[600px] overflow-auto">
          {!selected && <div className="text-sm text-muted-foreground">Select a campaign.</div>}
          {selected && (
            <div className="grid grid-cols-4 gap-2">
              <StatBox label="Sent" value={stats.sent} icon={<Send className="h-3.5 w-3.5" />} />
              <StatBox label="Opened" value={`${stats.opened} (${stats.openRate}%)`} icon={<Eye className="h-3.5 w-3.5" />} />
              <StatBox label="Clicked" value={`${stats.clicked} (${stats.clickRate}%)`} icon={<MousePointerClick className="h-3.5 w-3.5" />} />
              <StatBox label="Activated" value={`${stats.activated} (${stats.actRate}%)`} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
            </div>
          )}
          {recipients.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs p-2 border-b last:border-0">
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{r.email ?? "(no email)"}</div>
                <div className="text-[11px] text-muted-foreground flex gap-2 mt-0.5">
                  {r.first_opened_at && <span title={r.first_opened_at}><Eye className="h-3 w-3 inline" /> {r.open_count}</span>}
                  {r.first_clicked_at && <span title={r.last_clicked_url ?? ""}><MousePointerClick className="h-3 w-3 inline" /> {r.click_count}</span>}
                  {r.activated_at && <span className="text-emerald-700"><CheckCircle2 className="h-3 w-3 inline" /> activated</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.error && <span className="text-red-700 truncate max-w-[200px]" title={r.error}>{r.error}</span>}
                <Badge variant={r.status === "sent" || r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
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

function StatBox({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="border rounded p-2 bg-muted/30">
      <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">{icon} {label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
    </div>
  );
}

// ============= Template CRUD =============

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}

function NewTemplateButton({ onCreated }: { onCreated: (slug: string) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"marketing" | "activation">("marketing");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    let slug = slugify(name);
    if (!slug) slug = `template_${Date.now()}`;
    // Ensure unique
    const { data: existing } = await supabase.from("platform_email_templates").select("slug").eq("slug", slug).maybeSingle();
    if (existing) slug = `${slug}_${Date.now().toString(36)}`;
    const { error } = await supabase.from("platform_email_templates").insert({
      slug, name: name.trim(), kind, is_system: false,
      subject: "New email subject",
      body_html: "<p>Hi {{contact_name}},</p><p>Write your message here.</p>",
      body_text: "Hi {{contact_name}},\n\nWrite your message here.",
    });
    setSaving(false);
    if (error) { toast({ title: "Create failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Template created" });
    setOpen(false); setName(""); onCreated(slug);
  };

  return (
    <>
      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> New
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Follow-up after 3 days" />
            </div>
            <div>
              <Label className="text-xs">Kind</Label>
              <Select value={kind} onValueChange={(v: any) => setKind(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing (no credentials)</SelectItem>
                  <SelectItem value="activation">Activation (sign-in link)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateRowActions({
  template, onChange, onDeleted,
}: { template: Template; onChange: () => void; onDeleted: () => void }) {
  const { toast } = useToast();
  const duplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newSlug = `${template.slug}_copy_${Date.now().toString(36)}`;
    const { error } = await supabase.from("platform_email_templates").insert({
      slug: newSlug, name: `${template.name} (copy)`, kind: template.kind ?? "activation",
      subject: template.subject, body_html: template.body_html, body_text: template.body_text,
      description: template.description, is_system: false,
    });
    if (error) { toast({ title: "Duplicate failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Duplicated" }); onChange();
  };
  const del = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (template.is_system) { toast({ title: "Cannot delete system template", variant: "destructive" }); return; }
    if (!confirm(`Delete template "${template.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("platform_email_templates").delete().eq("id", template.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted" }); onDeleted();
  };
  return (
    <div className="opacity-0 group-hover:opacity-100 flex items-center pr-1">
      <button onClick={duplicate} title="Duplicate" className="p-1 hover:bg-background rounded">
        <Copy className="h-3 w-3" />
      </button>
      {!template.is_system && (
        <button onClick={del} title="Delete" className="p-1 hover:bg-background rounded text-destructive">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ============= Triggers =============

interface CampaignTrigger {
  id: string;
  campaign_id: string | null;
  template_slug: string | null;
  condition: "not_opened" | "not_clicked" | "not_activated";
  delay_hours: number;
  action_template_slug: string;
  enabled: boolean;
  max_follow_ups: number;
}

function TriggersTab() {
  const { toast } = useToast();
  const [triggers, setTriggers] = useState<CampaignTrigger[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<Partial<CampaignTrigger>>({
    condition: "not_opened", delay_hours: 72, max_follow_ups: 1, enabled: true,
  });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: t } = await supabase.from("platform_campaign_triggers").select("*").order("created_at", { ascending: false });
    setTriggers((t ?? []) as CampaignTrigger[]);
    const { data: tpl } = await supabase.from("platform_email_templates").select("*").order("name");
    setTemplates((tpl ?? []) as Template[]);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!draft.action_template_slug) { toast({ title: "Pick a follow-up template", variant: "destructive" }); return; }
    if (!draft.template_slug && !draft.campaign_id) { toast({ title: "Pick a source template (applies to all campaigns)", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await supabase.from("platform_campaign_triggers").insert({
      template_slug: draft.template_slug ?? null,
      campaign_id: null,
      condition: draft.condition!,
      delay_hours: draft.delay_hours!,
      action_template_slug: draft.action_template_slug,
      max_follow_ups: draft.max_follow_ups ?? 1,
      enabled: draft.enabled ?? true,
    });
    setBusy(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Trigger created" });
    setShowNew(false); setDraft({ condition: "not_opened", delay_hours: 72, max_follow_ups: 1, enabled: true });
    load();
  };

  const toggle = async (t: CampaignTrigger) => {
    await supabase.from("platform_campaign_triggers").update({ enabled: !t.enabled }).eq("id", t.id);
    load();
  };
  const del = async (t: CampaignTrigger) => {
    if (!confirm("Delete this trigger?")) return;
    await supabase.from("platform_campaign_triggers").delete().eq("id", t.id);
    load();
  };

  const runNow = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("process-campaign-triggers", { body: {} });
    setBusy(false);
    if (error) { toast({ title: "Run failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Trigger sweep complete", description: `Processed ${data?.processed ?? 0} · Dispatched ${data?.dispatched ?? 0}` });
  };

  const tplName = (slug: string | null) => templates.find(t => t.slug === slug)?.name ?? slug ?? "—";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Follow-up triggers</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={runNow} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Run sweep now
            </Button>
            <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New trigger</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Triggers automatically send a follow-up email when a recipient has not opened, clicked, or activated within the delay window.
          The sweep runs every 30 minutes automatically.
        </p>
        <div className="space-y-2">
          {triggers.length === 0 && <div className="text-sm text-muted-foreground">No triggers yet.</div>}
          {triggers.map(t => (
            <div key={t.id} className="border rounded p-3 flex items-center gap-3">
              <Switch checked={t.enabled} onCheckedChange={() => toggle(t)} />
              <div className="flex-1 text-sm">
                <div>
                  When recipients of <span className="font-medium">{tplName(t.template_slug)}</span> have
                  {" "}<Badge variant="outline">{t.condition.replace("_", " ")}</Badge>{" "}
                  after <span className="font-medium">{t.delay_hours}h</span>,
                  send <span className="font-medium">{tplName(t.action_template_slug)}</span>
                  {" "}(max {t.max_follow_ups})
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => del(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New follow-up trigger</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">For campaigns using this source template</Label>
              <Select value={draft.template_slug ?? ""} onValueChange={(v) => setDraft({ ...draft, template_slug: v })}>
                <SelectTrigger><SelectValue placeholder="Pick template" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Condition</Label>
                <Select value={draft.condition} onValueChange={(v: any) => setDraft({ ...draft, condition: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_opened">Not opened</SelectItem>
                    <SelectItem value="not_clicked">Not clicked</SelectItem>
                    <SelectItem value="not_activated">Not activated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Delay (hours)</Label>
                <Input type="number" min={1} value={draft.delay_hours ?? 72}
                  onChange={e => setDraft({ ...draft, delay_hours: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Follow-up template to send</Label>
              <Select value={draft.action_template_slug ?? ""} onValueChange={(v) => setDraft({ ...draft, action_template_slug: v })}>
                <SelectTrigger><SelectValue placeholder="Pick follow-up template" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Max follow-ups per recipient (1–2)</Label>
              <Input type="number" min={1} max={2} value={draft.max_follow_ups ?? 1}
                onChange={e => setDraft({ ...draft, max_follow_ups: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
