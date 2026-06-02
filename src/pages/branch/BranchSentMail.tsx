import { useEffect, useMemo, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Search, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  category: string;
  attempts: number;
  queued_at: string;
  sent_at: string | null;
  error_message: string | null;
  html: string | null;
  text_body: string | null;
  email_account_id: string | null;
  metadata: Record<string, unknown>;
}

const STATUS_TONE: Record<string, string> = {
  queued: "bg-blue-100 text-blue-700 border-blue-200",
  sending: "bg-amber-100 text-amber-700 border-amber-200",
  sent: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  dlq: "bg-red-200 text-red-900 border-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

const TENANT_ADMIN_ROLES = new Set(["owner", "admin"]);

export default function BranchSentMail() {
  const { tenantId, branchId, membershipRole } = useTenantContext();
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [accountLabels, setAccountLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OutboxRow | null>(null);

  const canCancel = membershipRole ? TENANT_ADMIN_ROLES.has(membershipRole) : false;

  const load = async () => {
    if (!tenantId || !branchId) return;
    setLoading(true);
    let q = supabase
      .from("email_outbox")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .order("queued_at", { ascending: false })
      .limit(500);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (categoryFilter !== "all") q = q.eq("category", categoryFilter);
    const { data } = await q;
    setRows((data as any) ?? []);

    // Fetch account labels for the detail sheet
    const { data: accounts } = await supabase
      .from("email_accounts")
      .select("id,label,from_email")
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId);
    const map: Record<string, string> = {};
    (accounts ?? []).forEach((a: any) => { map[a.id] = `${a.label} <${a.from_email}>`; });
    setAccountLabels(map);

    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId, branchId, statusFilter, categoryFilter]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.to_email.toLowerCase().includes(q) ||
      r.subject.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return {
      queued: rows.filter(r => r.status === "queued").length,
      sending: rows.filter(r => r.status === "sending").length,
      sentToday: rows.filter(r => r.status === "sent" && r.sent_at && new Date(r.sent_at) >= today).length,
      failed: rows.filter(r => r.status === "failed").length,
      dlq: rows.filter(r => r.status === "dlq").length,
    };
  }, [rows]);

  const categories = useMemo(() => {
    const set = new Set(rows.map(r => r.category));
    return Array.from(set);
  }, [rows]);

  const cancel = async (id: string) => {
    await supabase.from("email_outbox").update({ status: "cancelled" }).eq("id", id);
    load();
  };

  if (!branchId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a branch to view its outgoing mail.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6" /> Sent Mail</h1>
          <p className="text-muted-foreground">Outgoing email queue and history for this branch.</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Queued", value: stats.queued, tone: "text-blue-700" },
          { label: "Sending", value: stats.sending, tone: "text-amber-700" },
          { label: "Sent today", value: stats.sentToday, tone: "text-green-700" },
          { label: "Failed", value: stats.failed, tone: "text-red-700" },
          { label: "Dead-letter", value: stats.dlq, tone: "text-red-900" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">{s.label}</p>
              <p className={`text-2xl font-bold ${s.tone}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by recipient or subject…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="sending">Sending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="dlq">Dead-letter</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase border-b">
                <tr>
                  <th className="py-2 px-2">When</th>
                  <th className="py-2 px-2">To</th>
                  <th className="py-2 px-2">Subject</th>
                  <th className="py-2 px-2">Category</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No emails yet.</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} onClick={() => setSelected(r)} className="border-b hover:bg-muted/50 cursor-pointer">
                      <td className="py-2 px-2 whitespace-nowrap">{new Date(r.queued_at).toLocaleString()}</td>
                      <td className="py-2 px-2">{r.to_email}</td>
                      <td className="py-2 px-2 truncate max-w-[280px]">{r.subject}</td>
                      <td className="py-2 px-2"><Badge variant="outline">{r.category}</Badge></td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${STATUS_TONE[r.status] ?? ""}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 px-2">{r.attempts}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">{selected.subject}</SheetTitle>
              </SheetHeader>
              <div className="text-sm text-muted-foreground mt-2 space-y-1">
                <div><strong>To:</strong> {selected.to_email}</div>
                <div><strong>Status:</strong> {selected.status} ({selected.attempts} attempts)</div>
                <div><strong>Queued:</strong> {new Date(selected.queued_at).toLocaleString()}</div>
                {selected.sent_at && <div><strong>Sent:</strong> {new Date(selected.sent_at).toLocaleString()}</div>}
                {selected.email_account_id && accountLabels[selected.email_account_id] && (
                  <div><strong>Sent via:</strong> {accountLabels[selected.email_account_id]}</div>
                )}
                {selected.error_message && (
                  <div className="text-destructive"><strong>Error:</strong> {selected.error_message}</div>
                )}
              </div>
              {selected.status === "queued" && canCancel && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { cancel(selected.id); setSelected(null); }}>
                  Cancel queued
                </Button>
              )}
              <Tabs defaultValue="html" className="mt-4">
                <TabsList>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                  <TabsTrigger value="text">Plain text</TabsTrigger>
                  <TabsTrigger value="meta">Metadata</TabsTrigger>
                </TabsList>
                <TabsContent value="html">
                  <iframe
                    title="email"
                    className="w-full h-[60vh] border rounded mt-2 bg-white"
                    srcDoc={selected.html ?? "<em>No HTML body</em>"}
                  />
                </TabsContent>
                <TabsContent value="text">
                  <pre className="whitespace-pre-wrap text-xs bg-muted p-3 rounded max-h-[60vh] overflow-auto">{selected.text_body ?? "—"}</pre>
                </TabsContent>
                <TabsContent value="meta">
                  <pre className="text-xs bg-muted p-3 rounded max-h-[60vh] overflow-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
