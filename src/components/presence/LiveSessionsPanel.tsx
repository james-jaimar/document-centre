import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";

type Row = {
  user_id: string;
  tenant_id: string | null;
  email: string | null;
  display_name: string | null;
  role: string | null;
  current_path: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export function presenceStatus(lastSeen: string, now = Date.now()): "online" | "away" | "offline" {
  const mins = (now - new Date(lastSeen).getTime()) / 60000;
  if (mins < 3) return "online";
  if (mins < 15) return "away";
  return "offline";
}

const dot: Record<string, string> = {
  online: "bg-primary animate-pulse",
  away: "bg-accent",
  offline: "bg-muted-foreground/40",
};

interface Props {
  /** Limit to one tenant (tenant admin view). Omit for platform-wide. */
  tenantId?: string | null;
  showTenant?: boolean;
  title?: string;
}

export function LiveSessionsPanel({ tenantId, showTenant, title = "Who's online" }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["user-presence", tenantId ?? "all"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      let q = (supabase.from("user_presence" as never) as any)
        .select("user_id,tenant_id,email,display_name,role,current_path,first_seen_at,last_seen_at")
        .gte("last_seen_at", since)
        .order("last_seen_at", { ascending: false })
        .limit(500);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const tenantIds = Array.from(new Set(rows.map((r) => r.tenant_id).filter(Boolean))) as string[];
  const { data: tenantNames = {} } = useQuery({
    queryKey: ["presence-tenant-names", tenantIds.join(",")],
    enabled: !!showTenant && tenantIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id,name").in("id", tenantIds);
      return Object.fromEntries((data ?? []).map((t: any) => [t.id, t.name])) as Record<string, string>;
    },
  });

  const now = Date.now();
  const online = rows.filter((r) => presenceStatus(r.last_seen_at, now) === "online");
  const onlineTenants = new Set(online.map((r) => r.tenant_id ?? "none")).size;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {online.length} online now{showTenant ? ` across ${onlineTenants} tenant${onlineTenants === 1 ? "" : "s"}` : ""}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No one has been active in the last 24 hours.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">User</th>
                  {showTenant && <th className="px-4 py-2">Tenant</th>}
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Current page</th>
                  <th className="px-4 py-2">Last active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = presenceStatus(r.last_seen_at, now);
                  return (
                    <tr key={r.user_id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[s]}`} title={s} />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.display_name || r.email || "Unknown"}</div>
                            {r.display_name && r.email && (
                              <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      {showTenant && (
                        <td className="px-4 py-2">{r.tenant_id ? tenantNames[r.tenant_id] ?? "…" : "—"}</td>
                      )}
                      <td className="px-4 py-2">
                        {r.role ? <Badge variant="outline" className="capitalize">{r.role.replace(/_/g, " ")}</Badge> : "—"}
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-2 font-mono text-xs" title={r.current_path ?? ""}>
                        {r.current_path ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                        {s === "online" ? "Now" : formatDistanceToNow(new Date(r.last_seen_at), { addSuffix: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
