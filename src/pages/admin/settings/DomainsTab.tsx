import { useState, useEffect } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Globe, CheckCircle2, AlertCircle, Copy, ExternalLink, Loader2 } from "lucide-react";

const PLATFORM_DOMAIN = "document-centre.com";

export function DomainsTab() {
  const { tenantId } = useTenantContext();
  const [slug, setSlug] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [savedDomain, setSavedDomain] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      const { data } = await supabase
        .from("tenants")
        .select("slug, custom_domain")
        .eq("id", tenantId)
        .single();
      if (data) {
        setSlug(data.slug);
        setCustomDomain(data.custom_domain || "");
        setSavedDomain(data.custom_domain || "");
      }
    };
    load();
  }, [tenantId]);

  const platformSubdomain = slug ? `${slug}.${PLATFORM_DOMAIN}` : "";

  const saveDomain = async () => {
    if (!tenantId) return;
    setSaving(true);
    const cleanDomain = customDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const { error } = await supabase
      .from("tenants")
      .update({ custom_domain: cleanDomain || null })
      .eq("id", tenantId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSavedDomain(cleanDomain);
      setCustomDomain(cleanDomain);
      toast.success("Custom domain saved");
      setVerificationResult(null);
    }
  };

  const verifyDns = async () => {
    if (!savedDomain || !tenantId) return;
    setVerifying(true);
    setVerificationResult(null);
    const { data, error } = await supabase.functions.invoke("verify-domain", {
      body: { domain: savedDomain, tenant_id: tenantId, expected_target: platformSubdomain },
    });
    setVerifying(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setVerificationResult(data);
    if (data?.verified) {
      toast.success("DNS verified successfully!");
    } else {
      toast.error("DNS verification failed — check your records.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6">
      {/* Platform subdomain — always available */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Platform Subdomain
          </CardTitle>
          <CardDescription>
            Your default storefront address on Document Centre. This is always active and cannot be changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {platformSubdomain ? (
            <div className="flex items-center gap-3">
              <code className="rounded bg-muted px-3 py-1.5 text-sm font-mono">
                {platformSubdomain}
              </code>
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Active
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(platformSubdomain)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Customers can access your storefront at <strong>https://{platformSubdomain}</strong>.
            This requires wildcard DNS and SSL to be configured on the hosting infrastructure.
          </p>
        </CardContent>
      </Card>

      {/* Custom domain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Custom Domain
          </CardTitle>
          <CardDescription>
            Connect your own domain (e.g. <strong>store.yourcompany.co.za</strong>) to your storefront.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Domain</Label>
            <div className="flex gap-2">
              <Input
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="store.yourcompany.co.za"
                className="max-w-md font-mono"
              />
              <Button
                onClick={saveDomain}
                disabled={saving || customDomain.trim() === savedDomain}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>

          {savedDomain && (
            <>
              {/* CNAME instructions */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                <p className="text-sm font-medium text-blue-900">DNS Configuration Required</p>
                <p className="text-sm text-blue-800">
                  Log in to your domain registrar and create the following DNS record:
                </p>
                <div className="overflow-x-auto">
                  <table className="text-sm w-full">
                    <thead>
                      <tr className="text-left text-blue-700">
                        <th className="pr-6 py-1">Type</th>
                        <th className="pr-6 py-1">Name / Host</th>
                        <th className="py-1">Value / Target</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-blue-900">
                      <tr>
                        <td className="pr-6 py-1">CNAME</td>
                        <td className="pr-6 py-1">{savedDomain.split(".")[0]}</td>
                        <td className="py-1 flex items-center gap-2">
                          {platformSubdomain}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => copyToClipboard(platformSubdomain)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-blue-600">
                  DNS changes can take up to 48 hours to propagate. Once configured, click "Verify DNS" below.
                </p>
              </div>

              {/* Verify button */}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={verifyDns}
                  disabled={verifying}
                >
                  {verifying ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Checking…</>
                  ) : (
                    "Verify DNS"
                  )}
                </Button>

                {verificationResult && (
                  <div className="flex items-center gap-2">
                    {verificationResult.verified ? (
                      <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 gap-1">
                        <AlertCircle className="h-3 w-3" /> Not verified
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {verificationResult && !verificationResult.verified && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{verificationResult.message}</p>
                  {verificationResult.cname_records && (
                    <p>CNAME records found: {verificationResult.cname_records.join(", ")}</p>
                  )}
                  {verificationResult.a_records && (
                    <p>A records found: {verificationResult.a_records.join(", ")}</p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
