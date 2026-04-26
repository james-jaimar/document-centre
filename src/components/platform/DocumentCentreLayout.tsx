import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { opsApi } from "@/lib/opsApi";
import { useOpsStream } from "@/hooks/useOpsStream";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/platform/document-centre", label: "Overview", end: true },
  { to: "/platform/document-centre/queues", label: "Queues" },
  { to: "/platform/document-centre/workers", label: "Workers" },
  { to: "/platform/document-centre/jobs", label: "Jobs" },
  { to: "/platform/document-centre/assets", label: "Assets" },
  { to: "/platform/document-centre/metrics", label: "Metrics" },
  { to: "/platform/document-centre/storage", label: "Storage" },
  { to: "/platform/document-centre/config", label: "Config" },
  { to: "/platform/document-centre/audit", label: "Audit" },
];

export default function DocumentCentreLayout() {
  const health = useQuery({ queryKey: ["ops", "health"], queryFn: opsApi.healthFull, refetchInterval: 30000, refetchIntervalInBackground: false });
  const { connected } = useOpsStream();
  const status = health.data?.status ?? (health.isLoading ? "…" : "down");
  const variant: "default" | "secondary" | "destructive" =
    status === "ok" ? "default" : status === "degraded" ? "secondary" : "destructive";

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-background/60 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 pt-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Document Centre</h1>
            <p className="text-xs text-muted-foreground">PDF processing pipeline — ops & control</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={variant}>{String(status).toUpperCase()}</Badge>
            <Badge variant={connected ? "default" : "secondary"}>{connected ? "LIVE" : "OFFLINE"}</Badge>
          </div>
        </div>
        <nav className="flex gap-1 px-4 pt-3 overflow-x-auto">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "px-3 py-2 text-sm rounded-t-md border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
