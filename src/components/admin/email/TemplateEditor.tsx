/**
 * Shared email-template editor used by both the platform Communications
 * screen and each tenant's Communications screen.
 *
 * Platform mode: every template, every kind, system badge, kind picker.
 * Tenant mode: marketing templates only; the tenant's own rows are editable,
 * shared platform rows are fully read-only with a Duplicate action.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Save, Code2, Plus, Copy, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { EmailPreviewFrame } from "@/components/admin/EmailPreviewFrame";
import { applyMergeTokens, defaultPreviewVars, renderEmailShell } from "@/lib/email/renderEmailPreview";

export interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  subject: string;
  body_html: string;
  body_text: string | null;
  is_system?: boolean | null;
  tenant_id?: string | null;
  kind?: string | null;
}

export const TOKENS_ACTIVATION = [
  "branch_name", "contact_name", "store_url", "login_email",
  "action_link", "tenant_name", "portal_name",
];
export const TOKENS_MARKETING = [
  "contact_name", "customer_name", "company_name", "branch_name",
  "tenant_name", "activation_link", "action_link", "unsubscribe_link",
];

function slugifyName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface Props {
  /** "platform" edits every template; "tenant" only the active tenant's own. */
  scope: "platform" | "tenant";
  /** Required in tenant mode — new/duplicated templates are owned by it. */
  tenantId?: string | null;
  /** Restrict the list to one kind (tenant mode uses "marketing"). */
  kindFilter?: string;
  /** Portal name shown in the preview shell. */
  portalName?: string;
}

export default function TemplateEditor({
  scope, tenantId, kindFilter, portalName = "Document Centre",
}: Props) {
  const { toast } = useToast();
  const isTenant = scope === "tenant";
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [tokenTarget, setTokenTarget] = useState<"body" | "text">("body");
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<EmailTemplate | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const htmlRef = useRef<HTMLTextAreaElement | null>(null);

  const load = async (selectId?: string) => {
    let q = supabase.from("platform_email_templates" as any).select("*").order("name");
    if (kindFilter) q = q.eq("kind", kindFilter);
    const { data } = await q;
    const rows = ((data ?? []) as unknown) as EmailTemplate[];
    setTemplates(rows);
    setSelectedId((cur) => selectId ?? (cur && rows.some((r) => r.id === cur) ? cur : rows[0]?.id ?? ""));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId, kindFilter]);

  useEffect(() => {
    const t = templates.find((x) => x.id === selectedId);
    setDraft(t ? { ...t } : null);
  }, [selectedId, templates]);

  /** In tenant mode, shared (master) templates cannot be edited. */
  const readOnly = isTenant && !!draft && !draft.tenant_id;

  const original = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );
  const dirty = !!draft && !!original && (
    draft.name !== original.name ||
    draft.slug !== original.slug ||
    draft.kind !== original.kind ||
    draft.subject !== original.subject ||
    draft.body_html !== original.body_html ||
    (draft.body_text ?? "") !== (original.body_text ?? "") ||
    (draft.description ?? "") !== (original.description ?? "")
  );

  const visibleTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      [t.name, t.slug, t.subject, t.description ?? ""].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [templates, search]);

  const tokens = useMemo(
    () => ((draft?.kind ?? kindFilter) === "marketing" ? TOKENS_MARKETING : TOKENS_ACTIVATION),
    [draft?.kind, kindFilter],
  );


  const previewVars = defaultPreviewVars();
  const previewHtml = draft?.body_html
    ? renderEmailShell({
        portalName,
        bodyHtml: applyMergeTokens(draft.body_html, previewVars),
      })
    : "";

  const save = async () => {
    if (!draft?.id || readOnly) return;
    const slug = slugifyName(draft.slug ?? "") || draft.slug;
    setSaving(true);
    const { error } = await supabase
      .from("platform_email_templates" as any)
      .update({
        name: draft.name,
        slug,
        kind: draft.kind ?? kindFilter ?? "marketing",
        subject: draft.subject,
        body_html: draft.body_html,
        body_text: draft.body_text,
        description: draft.description ?? null,
      } as any)
      .eq("id", draft.id);
    setSaving(false);
    if (error) {
      toast({
        title: "Save failed",
        description: error.message.includes("duplicate")
          ? "Another template already uses that reference (slug)."
          : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Saved" });
    load(draft.id);
  };

  const createTemplate = async (opts: { name: string; kind: string; from?: EmailTemplate }) => {
    const base = slugifyName(opts.name) || "template";
    const suffix = isTenant && tenantId ? `-${tenantId.slice(0, 6)}` : "";
    let slug = `${base}${suffix}`;
    const { data: existing } = await supabase
      .from("platform_email_templates" as any).select("slug").eq("slug", slug).maybeSingle();
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const { data, error } = await supabase
      .from("platform_email_templates" as any)
      .insert({
        slug,
        name: opts.name,
        kind: opts.kind,
        is_system: false,
        tenant_id: isTenant ? tenantId : null,
        subject: opts.from?.subject ?? "New email subject",
        body_html: opts.from?.body_html
          ?? "<p>Hi {{contact_name}},</p><p>Write your message here.</p>",
        body_text: opts.from?.body_text ?? "Hi {{contact_name}},\n\nWrite your message here.",
        description: opts.from?.description ?? null,
      } as any)
      .select("id").single();
    if (error) { toast({ title: "Create failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: opts.from ? "Duplicated" : "Template created" });
    await load((data as any).id);
  };

  const canDelete = (t: EmailTemplate) => (isTenant ? !!t.tenant_id : true);

  const rename = async () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    const { error } = await supabase
      .from("platform_email_templates" as any).update({ name } as any).eq("id", renaming.id);
    if (error) { toast({ title: "Rename failed", description: error.message, variant: "destructive" }); return; }
    setRenaming(null);
    toast({ title: "Renamed" });
    load(renaming.id);
  };

  const confirmDelete = async () => {
    const t = pendingDelete;
    if (!t) return;
    setDeleting(true);
    const { error } = await supabase.from("platform_email_templates" as any).delete().eq("id", t.id);
    setDeleting(false);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    setPendingDelete(null);
    toast({ title: "Deleted" });
    setSelectedId("");
    load();
  };


  const insertIntoTextarea = (
    ref: React.RefObject<HTMLTextAreaElement>,
    field: "body_text" | "body_html",
    token: string,
  ) => {
    if (!draft) return;
    const el = ref.current;
    const snippet = `{{${token}}}`;
    if (!el) {
      setDraft({ ...draft, [field]: `${draft[field] ?? ""}${snippet}` });
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    setDraft({ ...draft, [field]: el.value.slice(0, start) + snippet + el.value.slice(end) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const handleTokenClick = (token: string) => {
    if (readOnly || !draft) return;
    if (tokenTarget === "text") return insertIntoTextarea(textRef, "body_text", token);
    if (rawMode) return insertIntoTextarea(htmlRef, "body_html", token);
    setDraft({ ...draft, body_html: `${draft.body_html ?? ""}{{${token}}}` });
  };

  return (
    <div className="border rounded-lg bg-card overflow-hidden h-[calc(100vh-12rem)] min-h-[560px] flex flex-col">
      {/* Narrow screens: template picker */}
      <div className="lg:hidden border-b p-2 flex items-center gap-2">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] divide-x">
        {/* List */}
        <div className="hidden lg:flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-1.5 border-b">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Templates</span>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setNewOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
            {templates.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">No templates yet — create your first one.</p>
            )}
            {templates.map((t) => {
              const shared = isTenant && !t.tenant_id;
              return (
                <div key={t.id}
                  className={`group flex items-center rounded ${selectedId === t.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                  <button onClick={() => setSelectedId(t.id)}
                    className={`flex-1 min-w-0 text-left px-2 py-1.5 text-sm ${selectedId === t.id ? "font-medium" : ""}`}>
                    <div className="truncate">{t.name}</div>
                    {isTenant ? (
                      <div className="text-[11px] text-muted-foreground">{shared ? "Shared (read-only)" : "Yours"}</div>
                    ) : (
                      t.is_system && <Badge variant="outline" className="mt-0.5 text-[10px] h-4 px-1">system</Badge>
                    )}
                  </button>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center pr-1">
                    <button title="Duplicate" className="p-1 hover:bg-background rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        createTemplate({ name: `${t.name} (copy)`, kind: t.kind ?? kindFilter ?? "marketing", from: t });
                      }}>
                      <Copy className="h-3 w-3" />
                    </button>
                    {!t.is_system && !shared && (
                      <button title="Delete" className="p-1 hover:bg-background rounded text-destructive"
                        onClick={(e) => { e.stopPropagation(); remove(t); }}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        {draft ? (
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-b bg-muted/30">
              <div className="text-sm font-medium truncate">{draft.name}</div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Code2 className="h-3.5 w-3.5" />
                  Raw HTML
                  <Switch checked={rawMode} onCheckedChange={setRawMode} />
                </label>
                {readOnly ? (
                  <Button size="sm" variant="outline"
                    onClick={() => createTemplate({
                      name: `${draft.name} (copy)`,
                      kind: draft.kind ?? kindFilter ?? "marketing",
                      from: draft,
                    })}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" /> Duplicate to edit
                  </Button>
                ) : (
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Save
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-3">
              {readOnly && (
                <div className="text-xs rounded-md border bg-muted/40 p-2">
                  This is a shared template. Duplicate it to make your own editable version.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={draft.name ?? ""} disabled={readOnly}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input value={draft.subject ?? ""} disabled={readOnly}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Description (internal note)</Label>
                <Input value={draft.description ?? ""} disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>

              <div>
                <Label className="text-xs">Email body</Label>
                {rawMode ? (
                  <Textarea ref={htmlRef} rows={14} className="font-mono text-xs" disabled={readOnly}
                    value={draft.body_html ?? ""}
                    onChange={(e) => setDraft({ ...draft, body_html: e.target.value })} />
                ) : readOnly ? (
                  <div className="rounded border bg-muted/20 p-3 text-sm prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: draft.body_html ?? "" }} />
                ) : (
                  <RichTextEditor
                    value={draft.body_html ?? ""}
                    onChange={(html) => setDraft({ ...draft, body_html: html })}
                  />
                )}
              </div>

              {(draft.kind ?? kindFilter) === "marketing" && (
                <div className="text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-900 p-2 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Drop <code className="font-mono">{"{{activation_link}}"}</code> anywhere in the body — every
                    recipient gets their own personal link merged in at send time.
                  </span>
                </div>
              )}

              <div>
                <Label className="text-xs">Plain-text body (fallback)</Label>
                <Textarea ref={textRef} rows={5} className="font-mono text-xs" disabled={readOnly}
                  value={draft.body_text ?? ""}
                  onChange={(e) => setDraft({ ...draft, body_text: e.target.value })} />
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
                {tokens.map((t) => (
                  <button key={t} type="button" disabled={readOnly}
                    onClick={() => handleTokenClick(t)}
                    className="px-2 py-0.5 rounded bg-muted hover:bg-muted/70 font-mono text-[11px] border disabled:opacity-50"
                    title={`Insert {{${t}}}`}>
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

      <NewTemplateDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        allowKindChoice={!isTenant && !kindFilter}
        defaultKind={kindFilter ?? "marketing"}
        onCreate={async (name, kind) => { await createTemplate({ name, kind }); setNewOpen(false); }}
      />
    </div>
  );
}

function NewTemplateDialog({
  open, onOpenChange, allowKindChoice, defaultKind, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allowKindChoice: boolean;
  defaultKind: string;
  onCreate: (name: string, kind: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState(defaultKind);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(""); setKind(defaultKind); } }, [open, defaultKind]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onCreate(name.trim(), kind);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Follow-up after 3 days" />
          </div>
          {allowKindChoice && (
            <div>
              <Label className="text-xs">Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing (no credentials)</SelectItem>
                  <SelectItem value="activation">Activation (sign-in link)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
