import { useState } from "react";
import { usePlatformEmailAccounts, type PlatformEmailAccount } from "@/hooks/usePlatformEmailAccounts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mail, AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";

export function PlatformEmailTab() {
  const { data: accounts = [], isLoading, refetch } = usePlatformEmailAccounts();
  const [connecting, setConnecting] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const microsoft = accounts.find((a) => a.transport === "graph_oauth");
  const others = accounts.filter((a) => a.transport !== "graph_oauth");

  const connectMicrosoft = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("microsoft-oauth-connect", {
        body: { action: "authorize", scope: "platform" },
      });
      if (error || (data as any)?.error) {
        toast.error(error?.message || (data as any)?.error);
        setConnecting(false);
        return;
      }
      const popup = window.open(
        (data as any).authorize_url,
        "microsoft-oauth-platform",
        "width=600,height=700,scrollbars=yes",
      );
      const poll = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(poll);
          setConnecting(false);
          await refetch();
        }
      }, 1000);
      const onMessage = async (event: MessageEvent) => {
        if (event.data?.type === "microsoft-oauth-callback") {
          clearInterval(poll);
          popup?.close();
          window.removeEventListener("message", onMessage);
          setConnecting(false);
          if (event.data.success) {
            toast.success(`Platform mailbox connected: ${event.data.email}`);
          } else {
            toast.error(event.data.error || "Microsoft connect failed");
          }
          await refetch();
        }
      };
      window.addEventListener("message", onMessage);
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  };

  const disconnect = async (acct: PlatformEmailAccount) => {
    if (!confirm(`Disconnect ${acct.label || acct.from_email}? Platform emails will fall back to the legacy account.`)) return;
    if (acct.transport === "graph_oauth") {
      const { error } = await supabase.functions.invoke("microsoft-oauth-connect", {
        body: { action: "disconnect", account_id: acct.id },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      // SMTP / other transports — delete via email-account-manage (platform admin policy covers it via service role on server).
      const { error } = await supabase.from("email_accounts").delete().eq("id", acct.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success("Disconnected");
    refetch();
  };

  const sendTest = async (acct: PlatformEmailAccount) => {
    if (!testRecipient) {
      toast.error("Enter a recipient first");
      return;
    }
    setTestingId(acct.id);
    const { data, error } = await supabase.functions.invoke("send-test-email", {
      body: { to: testRecipient, subject: `Document Centre · platform mailbox test (${acct.label})` },
    });
    setTestingId(null);
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error || "Test failed");
      return;
    }
    toast.success("Test email queued — check inbox in a few seconds");
    refetch();
  };


  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="text-base font-semibold mb-1">Platform sender mailbox</h3>
        <p className="text-sm text-muted-foreground">
          This mailbox sends every platform-level email: subscription receipts, plan changes, trial
          notifications, billing alerts and platform admin invitations. Tenants that have configured
          their own mailbox keep using it for their own customer-facing mail; this is only the
          fallback for tenant-less ("system") emails.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Microsoft 365 / Outlook
          </CardTitle>
          <CardDescription>
            Recommended. Sends from a real Microsoft 365 mailbox using delegated OAuth (refresh
            tokens stored in Supabase Vault). Connect <code>hello@document-centre.com</code> or any
            workspace mailbox you want as the platform sender.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : microsoft ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{microsoft.oauth_email || microsoft.from_email}</span>
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Connected
                    </Badge>
                    {microsoft.is_default && <Badge>Platform Default</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{microsoft.label}</p>
                  {microsoft.last_error && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {microsoft.last_error}
                    </p>
                  )}
                  {microsoft.last_verified_at && !microsoft.last_error && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last verified: {new Date(microsoft.last_verified_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => sendTest(microsoft)} disabled={testingId === microsoft.id}>
                    <Send className="h-3 w-3 mr-1" />
                    {testingId === microsoft.id ? "Sending…" : "Send test"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => disconnect(microsoft)}>
                    Disconnect
                  </Button>
                </div>
                <Input
                  type="email"
                  placeholder="test recipient@example.com"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  className="max-w-xs h-8 text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                Connect a Microsoft 365 mailbox to act as the platform sender. We only request
                send permission — we never read inboxes.
              </p>
              <Button onClick={connectMicrosoft} disabled={connecting} className="gap-2">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Connect Microsoft 365
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other platform accounts</CardTitle>
            <CardDescription>
              Additional accounts configured at the platform level (SMTP / Gmail / legacy Graph).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {others.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded border p-3">
                <div>
                  <div className="font-medium text-sm">{a.label || a.from_email}</div>
                  <div className="text-xs text-muted-foreground">{a.from_email} · {a.transport}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => disconnect(a)}>Remove</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
