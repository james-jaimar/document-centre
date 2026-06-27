// Platform sender mailbox — single Microsoft 365 OAuth connector.
//
// Uses the same `microsoft-oauth-connect` edge function as tenant/branch mail,
// with scope: "platform". The platform mailbox is a normal `email_accounts`
// row (tenant_id = null, branch_id = null, transport = "graph_oauth").
import { useState } from "react";
import { usePlatformEmailAccounts, type PlatformEmailAccount } from "@/hooks/usePlatformEmailAccounts";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionVerbose } from "@/lib/invokeEdgeFunctionVerbose";
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

  const microsoftAccount = accounts.find((a) => a.transport === "graph_oauth" && a.is_active);

  const connectMicrosoft = async () => {
    setConnecting(true);
    try {
      const result = await invokeEdgeFunctionVerbose<{ authorize_url: string }>(
        "microsoft-oauth-connect",
        { action: "authorize", scope: "platform" },
      );
      if (!result.ok || !result.data?.authorize_url) {
        toast.error(result.error || "Microsoft authorize failed");
        setConnecting(false);
        return;
      }
      const popup = window.open(
        result.data.authorize_url,
        "microsoft-oauth-connect-oauth",
        "width=600,height=700,scrollbars=yes",
      );
      const pollInterval = window.setInterval(async () => {
        if (popup?.closed) {
          window.clearInterval(pollInterval);
          setConnecting(false);
          await refetch();
        }
      }, 1000);
      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type === "microsoft-oauth-callback") {
          window.clearInterval(pollInterval);
          popup?.close();
          window.removeEventListener("message", handleMessage);
          setConnecting(false);
          if (event.data.success) {
            toast.success(`Microsoft 365 connected: ${event.data.email}`);
          } else {
            toast.error(event.data.error || "Microsoft connection failed");
          }
          await refetch();
        }
      };
      window.addEventListener("message", handleMessage);
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  };

  const disconnect = async (acct: PlatformEmailAccount) => {
    if (!confirm(`Disconnect ${acct.oauth_email || acct.from_email}? Platform emails will stop sending until reconnected.`)) return;
    const { data, error } = await supabase.functions.invoke("microsoft-oauth-connect", {
      body: { action: "disconnect", account_id: acct.id },
    });
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error);
      return;
    }
    toast.success("Microsoft 365 disconnected");
    refetch();
  };

  const sendTest = async (acct: PlatformEmailAccount) => {
    if (!testRecipient) {
      toast.error("Enter a recipient first");
      return;
    }
    setTestingId(acct.id);
    const { data, error } = await supabase.functions.invoke("email-account-manage", {
      body: { action: "test_send", id: acct.id, recipient: testRecipient },
    });
    setTestingId(null);
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error || "Test failed");
      return;
    }
    toast.success("Test email queued — check Sent Mail for delivery status");
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="text-base font-semibold mb-1">Platform sender mailbox</h3>
        <p className="text-sm text-muted-foreground">
          Sends every platform-level email (subscription receipts, plan changes, trial notices,
          billing alerts, admin invites). Sign in once with the Microsoft 365 account you want
          platform mail to come from.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Microsoft 365 / Outlook
          </CardTitle>
          <CardDescription>
            One-click connect via Microsoft. The refresh token is stored in Supabase Vault and
            used by the email worker only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : microsoftAccount ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{microsoftAccount.oauth_email || microsoftAccount.from_email}</span>
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Connected
                    </Badge>
                    {microsoftAccount.is_default && <Badge>Platform Default</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Platform emails will be sent from this Microsoft mailbox.
                  </p>
                  {microsoftAccount.last_error && (
                    <p className="text-xs text-destructive mt-1 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="break-words">{microsoftAccount.last_error}</span>
                    </p>
                  )}
                  {microsoftAccount.last_verified_at && !microsoftAccount.last_error && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last verified: {new Date(microsoftAccount.last_verified_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendTest(microsoftAccount)}
                    disabled={testingId === microsoftAccount.id}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    {testingId === microsoftAccount.id ? "Sending…" : "Send test"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => disconnect(microsoftAccount)}>
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
                Click below to authorize Document Centre to send platform emails from a Microsoft 365
                or Outlook mailbox. We only request send permission — we never read the inbox.
              </p>
              <Button onClick={connectMicrosoft} disabled={connecting} className="gap-2">
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg viewBox="0 0 23 23" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#f35325" d="M1 1h10v10H1z" />
                    <path fill="#81bc06" d="M12 1h10v10H12z" />
                    <path fill="#05a6f0" d="M1 12h10v10H1z" />
                    <path fill="#ffba08" d="M12 12h10v10H12z" />
                  </svg>
                )}
                Sign in with Microsoft
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
