import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, Loader2, Mail, MailOpen, Reply, ShieldAlert, Undo2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useContactSubmissions,
  useUpdateEnquiryStatus,
  type ContactSubmission,
  type EnquiryStatus,
} from "@/hooks/useContactSubmissions";

const TABS: { value: EnquiryStatus | "all"; label: string }[] = [
  { value: "new", label: "New" },
  { value: "read", label: "Read" },
  { value: "replied", label: "Replied" },
  { value: "spam", label: "Spam" },
  { value: "all", label: "All" },
];

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function PlatformEnquiries() {
  const { toast } = useToast();
  const [tab, setTab] = useState<EnquiryStatus | "all">("new");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useContactSubmissions(tab);
  const update = useUpdateEnquiryStatus();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.company, r.subject, r.message]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const selected: ContactSubmission | null =
    filtered.find((r) => r.id === selectedId) ?? null;

  const setStatus = (row: ContactSubmission, status: EnquiryStatus) => {
    update.mutate(
      { id: row.id, status },
      {
        onSuccess: () => toast({ title: `Marked as ${status}` }),
        onError: (e) => toast({ title: "Could not update", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  const openRow = (row: ContactSubmission) => {
    setSelectedId(row.id);
    if (row.status === "new") setStatus(row, "read");
  };

  return (
    <div className="px-6 py-4 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Inbox className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Enquiries</h1>
          <p className="text-sm text-muted-foreground">Messages submitted through the website contact form.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as EnquiryStatus | "all"); setSelectedId(null); }}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, email, company, subject or message"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardContent className="p-0 divide-y">
            {isLoading && (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading enquiries…
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">No enquiries here.</div>
            )}
            {filtered.map((row) => (
              <button
                key={row.id}
                onClick={() => openRow(row)}
                className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/60 ${
                  selectedId === row.id ? "bg-muted" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm ${row.status === "new" ? "font-semibold" : "font-medium"}`}>
                        {row.name}
                      </span>
                      {row.status === "new" && <Badge variant="default" className="h-5">New</Badge>}
                      {row.status === "replied" && <Badge variant="secondary" className="h-5">Replied</Badge>}
                      {row.status === "spam" && <Badge variant="destructive" className="h-5">Spam</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{row.email}{row.company ? ` · ${row.company}` : ""}</div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">
                      {row.subject ? <span className="text-foreground">{row.subject} — </span> : null}
                      {row.message}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-muted-foreground">{fmt(row.created_at)}</div>
                    {row.spam_score != null && Number(row.spam_score) > 0 && (
                      <Badge variant="outline" className="mt-1 h-5 text-[10px]">score {row.spam_score}</Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardContent className="p-5">
            {!selected && (
              <div className="text-sm text-muted-foreground">Select an enquiry to read it.</div>
            )}
            {selected && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">{selected.subject || "No subject"}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.name} · <a className="underline" href={`mailto:${selected.email}`}>{selected.email}</a>
                  </p>
                  <p className="text-xs text-muted-foreground">{fmt(selected.created_at)}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {selected.company && <div><span className="text-foreground">Company:</span> {selected.company}</div>}
                  {selected.phone && <div><span className="text-foreground">Phone:</span> {selected.phone}</div>}
                  {selected.source && <div><span className="text-foreground">Source:</span> {selected.source}</div>}
                  {selected.ip_address && <div><span className="text-foreground">IP:</span> {selected.ip_address}</div>}
                  {selected.spam_score != null && <div><span className="text-foreground">Spam score:</span> {selected.spam_score}</div>}
                  {selected.spam_reasons?.length ? (
                    <div className="col-span-2"><span className="text-foreground">Reasons:</span> {selected.spam_reasons.join(", ")}</div>
                  ) : null}
                  {selected.user_agent && (
                    <div className="col-span-2 break-all"><span className="text-foreground">User agent:</span> {selected.user_agent}</div>
                  )}
                </div>

                <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm leading-relaxed">
                  {selected.message}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <a href={`mailto:${selected.email}?subject=${encodeURIComponent("Re: " + (selected.subject || "Your Document Centre enquiry"))}`}>
                      <Reply className="mr-2 h-4 w-4" /> Reply by email
                    </a>
                  </Button>
                  {selected.status !== "replied" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(selected, "replied")}>
                      <MailOpen className="mr-2 h-4 w-4" /> Mark replied
                    </Button>
                  )}
                  {selected.status !== "new" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(selected, "new")}>
                      <Mail className="mr-2 h-4 w-4" /> Mark unread
                    </Button>
                  )}
                  {selected.status === "spam" ? (
                    <Button size="sm" variant="outline" onClick={() => setStatus(selected, "read")}>
                      <Undo2 className="mr-2 h-4 w-4" /> Not spam
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => setStatus(selected, "spam")}>
                      <ShieldAlert className="mr-2 h-4 w-4" /> Mark spam
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
