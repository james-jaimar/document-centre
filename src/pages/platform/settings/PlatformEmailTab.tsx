import { useEffect, useState } from "react";
import { usePlatformEmailAccounts, type PlatformEmailAccount } from "@/hooks/usePlatformEmailAccounts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, AlertCircle, CheckCircle2, Loader2, Send, ShieldCheck, ExternalLink } from "lucide-react";

/** Turn a raw Microsoft Graph / AAD error string into a concrete next step. */
function diagnoseGraphError(err: string | null | undefined): { title: string; steps: string[] } | null {
  if (!err) return null;
  const e = err.toLowerCase();
  if (e.includes("erroraccessdenied") || (e.includes("403") && e.includes("graph"))) {
    return {
      title: "Microsoft issued a token but Exchange refused the send.",
      steps: [
        "In Entra → App registrations → Doc Centre Mail Sender (GCP) → API permissions: confirm Microsoft Graph › Application › Mail.Send is listed AND has 'Granted for <your tenant>' (admin consent).",
        "Remove any Delegated Mail.Send if present — only the Application one is needed for app-only sending.",
        "In Exchange Online PowerShell, scope the app to the hello@ mailbox using Application RBAC (New-ServicePrincipal + New-ManagementScope + New-ManagementRoleAssignment 'Application Mail.Send'). If you skip scoping, the app can send as ANY mailbox in the tenant — but it should still work.",
        "Verify hello@document-centre.com is an actual licensed Exchange Online mailbox (not just an alias or distribution group).",
      ],
    };
  }
  if (e.includes("aadsts7000215") || e.includes("invalid client secret")) {
    return {
      title: "The client secret value is wrong or expired.",
      steps: [
        "In Entra → App registrations → Certificates & secrets, create a new Client secret.",
        "Copy the secret VALUE (not the secret ID) immediately and update MICROSOFT_GRAPH_CLIENT_SECRET in Lovable secrets.",
        "Re-provision below.",
      ],
    };
  }
  if (e.includes("aadsts700016") || e.includes("application with identifier")) {
    return {
      title: "The MICROSOFT_GRAPH_CLIENT_ID does not exist in the MICROSOFT_GRAPH_TENANT_ID directory.",
      steps: [
        "Double-check the Application (client) ID and Directory (tenant) ID on the App registration overview match the secrets in Lovable exactly.",
      ],
    };
  }
  if (e.includes("aadsts90002") || e.includes("tenant") && e.includes("not found")) {
    return {
      title: "The MICROSOFT_GRAPH_TENANT_ID is wrong.",
      steps: ["Use the Directory (tenant) ID GUID from the App registration overview."],
    };
  }
  if (e.includes("aadsts65001") || e.includes("does not have consent")) {
    return {
      title: "Admin consent for Mail.Send has not been granted.",
      steps: ["Entra → App registrations → API permissions → Grant admin consent for <your tenant>."],
    };
  }
  return null;
}

interface GraphStatus {
  secrets_present: { tenant_id: boolean; client_id: boolean; client_secret: boolean };
  account: null | {
    id: string;
    from_email: string;
    graph_sender_address: string | null;
    is_active: boolean;
    is_default: boolean;
    last_error: string | null;
    last_verified_at: string | null;
    label: string | null;
  };
}

export function PlatformEmailTab() {
  const { data: accounts = [], isLoading, refetch } = usePlatformEmailAccounts();
  const [status, setStatus] = useState<GraphStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [sender, setSender] = useState("hello@document-centre.com");
  const [provisioning, setProvisioning] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const loadStatus = async () => {
    setStatusLoading(true);
    const { data, error } = await supabase.functions.invoke("platform-graph-configure", {
      body: { action: "status" },
    });
    setStatusLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStatus(data as GraphStatus);
    if ((data as GraphStatus)?.account?.graph_sender_address) {
      setSender((data as GraphStatus).account!.graph_sender_address!);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const graphAccount = accounts.find((a) => a.transport === "graph" && a.is_active);
  const legacyOAuth = accounts.find((a) => a.transport === "graph_oauth");
  const others = accounts.filter((a) => a.transport !== "graph" && a.transport !== "graph_oauth");

  const provision = async () => {
    setProvisioning(true);
    const { data, error } = await supabase.functions.invoke("platform-graph-configure", {
      body: { action: "provision", sender_address: sender.trim() },
    });
    setProvisioning(false);
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error || "Provision failed");
      return;
    }
    toast.success("Platform Microsoft Graph mailbox configured");
    await Promise.all([loadStatus(), refetch()]);
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
    toast.success("Test email queued — check the recipient inbox shortly");
    refetch();
  };

  const removeOther = async (acct: PlatformEmailAccount) => {
    if (!confirm(`Remove ${acct.label || acct.from_email}?`)) return;
    const { error } = await supabase.from("email_accounts").delete().eq("id", acct.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed");
    refetch();
  };

  const secretsReady =
    status?.secrets_present.tenant_id &&
    status?.secrets_present.client_id &&
    status?.secrets_present.client_secret;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="text-base font-semibold mb-1">Platform sender mailbox</h3>
        <p className="text-sm text-muted-foreground">
          Sends every platform-level email (subscription receipts, plan changes, trial notices,
          billing alerts, admin invites). Uses Microsoft Graph <strong>app-only</strong>{" "}
          authentication — Microsoft's recommended path for service mailboxes: no refresh tokens,
          no re-consent, no AADSTS90013 surprises.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Microsoft 365 (Graph app-only)
          </CardTitle>
          <CardDescription>
            Configured once from your Azure App Registration. The client secret is stored in
            Supabase Vault and read by the email worker only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={status?.secrets_present.tenant_id ? "default" : "destructive"}>
                  MICROSOFT_GRAPH_TENANT_ID {status?.secrets_present.tenant_id ? "✓" : "missing"}
                </Badge>
                <Badge variant={status?.secrets_present.client_id ? "default" : "destructive"}>
                  MICROSOFT_GRAPH_CLIENT_ID {status?.secrets_present.client_id ? "✓" : "missing"}
                </Badge>
                <Badge variant={status?.secrets_present.client_secret ? "default" : "destructive"}>
                  MICROSOFT_GRAPH_CLIENT_SECRET {status?.secrets_present.client_secret ? "✓" : "missing"}
                </Badge>
              </div>

              {graphAccount ? (
                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{graphAccount.from_email}</span>
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </Badge>
                        {graphAccount.is_default && <Badge>Platform Default</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{graphAccount.label}</p>
                      {graphAccount.last_error && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {graphAccount.last_error}
                        </p>
                      )}
                      {graphAccount.last_verified_at && !graphAccount.last_error && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Last verified: {new Date(graphAccount.last_verified_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => sendTest(graphAccount)} disabled={testingId === graphAccount.id}>
                        <Send className="h-3 w-3 mr-1" />
                        {testingId === graphAccount.id ? "Sending…" : "Send test"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={provision} disabled={provisioning || !secretsReady}>
                        {provisioning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Re-provision
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
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sender">Sender mailbox (must exist in your M365 tenant)</Label>
                    <Input
                      id="sender"
                      type="email"
                      value={sender}
                      onChange={(e) => setSender(e.target.value)}
                      placeholder="hello@document-centre.com"
                    />
                  </div>
                  <Button onClick={provision} disabled={provisioning || !secretsReady} className="gap-2">
                    {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Provision platform mailbox
                  </Button>
                  {!secretsReady && (
                    <p className="text-xs text-destructive">
                      Add the three Microsoft Graph secrets above before provisioning.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {legacyOAuth && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Legacy delegated OAuth mailbox</CardTitle>
            <CardDescription>
              Old user-delegated Microsoft 365 connection. Superseded by app-only above — kept
              visible so you can remove it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <div className="font-medium text-sm">{legacyOAuth.oauth_email || legacyOAuth.from_email}</div>
                <div className="text-xs text-muted-foreground">
                  graph_oauth · {legacyOAuth.is_active ? "active" : "inactive"}
                </div>
                {legacyOAuth.last_error && (
                  <p className="text-xs text-destructive mt-1">{legacyOAuth.last_error}</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => removeOther(legacyOAuth)}>Remove</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other platform accounts</CardTitle>
            <CardDescription>SMTP / Gmail / etc.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {others.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded border p-3">
                <div>
                  <div className="font-medium text-sm">{a.label || a.from_email}</div>
                  <div className="text-xs text-muted-foreground">{a.from_email} · {a.transport}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => removeOther(a)}>Remove</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
