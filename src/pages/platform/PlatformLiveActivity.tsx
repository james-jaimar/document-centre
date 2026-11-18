import { LiveSessionsPanel } from "@/components/presence/LiveSessionsPanel";

const PlatformLiveActivity = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Live Activity</h1>
      <p className="text-muted-foreground">Everyone signed in across all tenants (last 24 hours). Guests aren't tracked.</p>
    </div>
    <LiveSessionsPanel showTenant title="Active sessions" />
  </div>
);

export default PlatformLiveActivity;
