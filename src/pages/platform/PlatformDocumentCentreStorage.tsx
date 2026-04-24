import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { opsApi } from "@/lib/opsApi";

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export default function PlatformDocumentCentreStorage() {
  const live = useQuery({ queryKey: ["ops", "storage-live"], queryFn: opsApi.storageLive, refetchInterval: 30000 });
  const history = useQuery({ queryKey: ["ops", "storage-history", 168], queryFn: () => opsApi.storageHistory(168), refetchInterval: 60000 });

  const chart = history.data?.map((r) => ({
    t: new Date(r.captured_at).toLocaleDateString([], { month: "short", day: "numeric" }),
    s3_gb: r.s3_bytes != null ? +(r.s3_bytes / 1024 ** 3).toFixed(2) : 0,
    disk_gb: r.disk_used_bytes != null ? +(r.disk_used_bytes / 1024 ** 3).toFixed(2) : 0,
  })) ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Storage</h2>
        <p className="text-sm text-muted-foreground">S3 bucket and local disk usage — live and 7-day history.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">S3 objects</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{live.data?.s3?.object_count?.toLocaleString() ?? "—"}</div>
            <p className="text-xs text-muted-foreground">{live.data?.s3?.bucket ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">S3 size</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtBytes(live.data?.s3?.bytes)}</div>
            <p className="text-xs text-muted-foreground">total bytes stored</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Local disk</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtBytes(live.data?.disk?.used)}</div>
            <p className="text-xs text-muted-foreground">{fmtBytes(live.data?.disk?.free)} free</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Storage history (GB · 7d)</CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="t" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              <Area type="monotone" dataKey="s3_gb" name="S3 (GB)" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.3)" />
              <Area type="monotone" dataKey="disk_gb" name="Disk (GB)" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.3)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
