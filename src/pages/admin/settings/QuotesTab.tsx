import { useState, useEffect } from "react";
import {
  useTenantSettingsMap,
  useUpsertTenantSetting,
} from "@/hooks/useTenantSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function QuotesTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap("quotes");
  const upsert = useUpsertTenantSetting();

  const [validity, setValidity] = useState<number>(30);
  const [terms, setTerms] = useState<string>("");
  const [emailIntro, setEmailIntro] = useState<string>("");

  useEffect(() => {
    if (isLoading) return;
    const v = settingsMap.default_validity_days as any;
    setValidity(typeof v === "number" ? v : Number(v) || 30);
    setTerms((settingsMap.pdf_terms as string) ?? "");
    setEmailIntro((settingsMap.email_intro as string) ?? "");
  }, [isLoading, settingsMap]);

  const save = async () => {
    try {
      await Promise.all([
        upsert.mutateAsync({
          category: "quotes",
          setting_key: "default_validity_days",
          setting_value: Number(validity) || 30,
          value_type: "number",
        }),
        upsert.mutateAsync({
          category: "quotes",
          setting_key: "pdf_terms",
          setting_value: terms,
          value_type: "string",
        }),
        upsert.mutateAsync({
          category: "quotes",
          setting_key: "email_intro",
          setting_value: emailIntro,
          value_type: "string",
        }),
      ]);
      toast.success("Quote settings saved");
    } catch (e: any) {
      toast.error("Failed", { description: e.message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quotes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="q-validity">Default validity (days)</Label>
          <Input
            id="q-validity"
            type="number"
            min={1}
            value={validity}
            onChange={(e) => setValidity(Number(e.target.value))}
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground mt-1">
            How long a new quote stays active before it auto-expires.
          </p>
        </div>
        <div>
          <Label htmlFor="q-terms">PDF terms &amp; conditions</Label>
          <Textarea
            id="q-terms"
            rows={5}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="E.g. Prices exclude VAT unless stated. Production begins on payment receipt."
          />
        </div>
        <div>
          <Label htmlFor="q-intro">Quote email intro</Label>
          <Textarea
            id="q-intro"
            rows={4}
            value={emailIntro}
            onChange={(e) => setEmailIntro(e.target.value)}
            placeholder="Custom intro text included above the quote summary in customer emails."
          />
        </div>
        <Button onClick={save} disabled={upsert.isPending}>
          {upsert.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
