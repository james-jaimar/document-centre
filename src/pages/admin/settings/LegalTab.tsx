import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ExternalLink, RotateCcw } from "lucide-react";
import {
  useTenantSettingsMap,
  useUpsertTenantSetting,
} from "@/hooks/useTenantSettings";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
  defaultTermsHtml,
  defaultPrivacyHtml,
  type LegalTemplateContext,
} from "@/lib/legal/defaultTemplates";

export function LegalTab() {
  const { tenantId } = useTenantContext();
  const { settingsMap, isLoading } = useTenantSettingsMap("legal");
  const upsert = useUpsertTenantSetting();

  // Pull tenant identity for template interpolation + the slug used in the preview link
  const { data: tenant } = useQuery({
    queryKey: ["legal-tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("name, slug, country, website_url, support_email")
        .eq("id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [terms, setTerms] = useState("");
  const [privacy, setPrivacy] = useState("");
  const [termsUpdated, setTermsUpdated] = useState<string | null>(null);
  const [privacyUpdated, setPrivacyUpdated] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    setTerms((settingsMap.terms_of_service as string) ?? "");
    setPrivacy((settingsMap.privacy_policy as string) ?? "");
    setTermsUpdated((settingsMap.terms_updated_at as string) ?? null);
    setPrivacyUpdated((settingsMap.privacy_updated_at as string) ?? null);
  }, [isLoading, settingsMap]);

  const ctx: LegalTemplateContext = {
    tenant_name: tenant?.name ?? "Our store",
    support_email: (tenant as any)?.support_email,
    website_url: (tenant as any)?.website_url,
    country: (tenant as any)?.country ?? "South Africa",
  };

  const save = async (kind: "terms" | "privacy") => {
    try {
      const now = new Date().toISOString();
      const valueKey = kind === "terms" ? "terms_of_service" : "privacy_policy";
      const stampKey = kind === "terms" ? "terms_updated_at" : "privacy_updated_at";
      const value = kind === "terms" ? terms : privacy;

      await Promise.all([
        upsert.mutateAsync({
          category: "legal",
          setting_key: valueKey,
          setting_value: value,
          value_type: "string",
        }),
        upsert.mutateAsync({
          category: "legal",
          setting_key: stampKey,
          setting_value: now,
          value_type: "string",
        }),
      ]);
      if (kind === "terms") setTermsUpdated(now);
      else setPrivacyUpdated(now);
      toast.success(kind === "terms" ? "Terms saved" : "Privacy policy saved");
    } catch (e: any) {
      toast.error("Failed to save", { description: e.message });
    }
  };

  const restoreDefault = (kind: "terms" | "privacy") => {
    if (!confirm(`Replace the current ${kind === "terms" ? "Terms" : "Privacy Policy"} with the standard template? Your current text will be discarded.`)) return;
    if (kind === "terms") setTerms(defaultTermsHtml(ctx));
    else setPrivacy(defaultPrivacyHtml(ctx));
  };

  const previewHref = (kind: "terms" | "privacy") =>
    tenant?.slug ? `/t/${tenant.slug}/${kind === "terms" ? "terms" : "privacy"}` : "#";

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "never";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Terms of Service</CardTitle>
            <CardDescription>
              Shown to customers at <code>/t/{tenant?.slug ?? "your-slug"}/terms</code>. Applies across all your branches.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">Last updated: {fmtDate(termsUpdated)}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <RichTextEditor value={terms} onChange={setTerms} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save("terms")} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save Terms"}
            </Button>
            <Button type="button" variant="outline" onClick={() => restoreDefault("terms")}>
              <RotateCcw className="mr-2 h-4 w-4" /> Restore default template
            </Button>
            <Button type="button" variant="ghost" asChild>
              <a href={previewHref("terms")} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Preview as customer
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Privacy Policy</CardTitle>
            <CardDescription>
              Shown to customers at <code>/t/{tenant?.slug ?? "your-slug"}/privacy</code>. Should describe how you handle personal information under POPIA.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">Last updated: {fmtDate(privacyUpdated)}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <RichTextEditor value={privacy} onChange={setPrivacy} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save("privacy")} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save Privacy Policy"}
            </Button>
            <Button type="button" variant="outline" onClick={() => restoreDefault("privacy")}>
              <RotateCcw className="mr-2 h-4 w-4" /> Restore default template
            </Button>
            <Button type="button" variant="ghost" asChild>
              <a href={previewHref("privacy")} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Preview as customer
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
