import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/formatCurrency";

interface CurrencyProfile {
  currency_code: string;
  symbol: string | null;
  fx_from_zar: number;
  buying_power_mult: number;
  rounding_step: number;
  min_value: number;
  notes: string | null;
}

interface PricingRule {
  id: string;
  name: string;
  rule_type: string;
  price_value: number;
  currency_code: string;
  is_active: boolean;
  product_family_id: string | null;
  product_families?: { name: string } | null;
}

const CURRENCY_LABELS: Record<string, string> = {
  ZAR: "🇿🇦 ZAR (Source)",
  GBP: "🇬🇧 GBP",
  EUR: "🇪🇺 EUR",
  USD: "🇺🇸 USD",
  AUD: "🇦🇺 AUD",
};

const RULE_TYPE_LABELS: Record<string, string> = {
  per_page: "Per Page",
  per_document: "Per Document",
  per_unit: "Per Unit",
  surcharge: "Surcharge",
  setup_fee: "Setup Fee",
};

export default function PlatformDemoPrintPricing() {
  const [profiles, setProfiles] = useState<CurrencyProfile[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfiles, setSavingProfiles] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [confirmCurrency, setConfirmCurrency] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("ZAR");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: pr }, { data: ru }] = await Promise.all([
      supabase.from("pricing_currency_profiles").select("*").order("currency_code"),
      supabase
        .from("pricing_rules")
        .select("id, name, rule_type, price_value, currency_code, is_active, product_family_id, product_families(name)")
        .order("sort_order"),
    ]);
    setProfiles((pr as CurrencyProfile[]) || []);
    setRules((ru as any[]) || []);
    setLoading(false);
  }

  function updateProfile(code: string, field: keyof CurrencyProfile, value: any) {
    setProfiles((prev) =>
      prev.map((p) => (p.currency_code === code ? { ...p, [field]: value } : p))
    );
  }

  async function saveProfiles() {
    setSavingProfiles(true);
    try {
      for (const p of profiles) {
        await supabase
          .from("pricing_currency_profiles")
          .update({
            fx_from_zar: p.fx_from_zar,
            buying_power_mult: p.buying_power_mult,
            rounding_step: p.rounding_step,
            min_value: p.min_value,
            notes: p.notes,
          })
          .eq("currency_code", p.currency_code);
      }
      toast.success("Currency profiles saved");
    } catch (e: any) {
      toast.error("Failed to save profiles", { description: e?.message });
    }
    setSavingProfiles(false);
  }

  async function regenerate(currency: string) {
    setRegenerating(currency);
    setConfirmCurrency(null);
    try {
      const { data, error } = await supabase.rpc(
        "regenerate_pricing_rules_for_currency",
        { p_currency: currency }
      );
      if (error) throw error;
      toast.success(`Regenerated ${data} ${currency} pricing rules from ZAR`);
      await loadAll();
    } catch (e: any) {
      toast.error("Regeneration failed", { description: e?.message });
    }
    setRegenerating(null);
  }

  const rulesByCurrency = useMemo(() => {
    const groups: Record<string, PricingRule[]> = {};
    for (const r of rules) {
      const c = r.currency_code || "ZAR";
      (groups[c] ??= []).push(r);
    }
    return groups;
  }, [rules]);

  const currencyTabs = ["ZAR", "GBP", "EUR", "USD", "AUD"];

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading demo print pricing…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Demo Print Pricing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ZAR is the source of truth. Other currencies are derived from ZAR via the
          per-currency profile (FX × buying power, rounded). Edit a ZAR rule and
          regenerate the regional copy here.
        </p>
      </div>

      {/* Currency profiles */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Currency profiles</CardTitle>
            <CardDescription>
              FX (price ÷ ZAR), buying power multiplier, rounding step, and minimum
              charge for each currency.
            </CardDescription>
          </div>
          <Button onClick={saveProfiles} disabled={savingProfiles} size="sm">
            <Save className="h-4 w-4 mr-2" />
            {savingProfiles ? "Saving…" : "Save profiles"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">FX (per ZAR)</TableHead>
                <TableHead className="text-right">Buying power ×</TableHead>
                <TableHead className="text-right">Round to</TableHead>
                <TableHead className="text-right">Min value</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.currency_code}>
                  <TableCell className="font-medium">
                    {CURRENCY_LABELS[p.currency_code] || p.currency_code}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.0001"
                      value={p.fx_from_zar}
                      onChange={(e) =>
                        updateProfile(p.currency_code, "fx_from_zar", parseFloat(e.target.value) || 0)
                      }
                      className="h-8 w-28 ml-auto text-right tabular-nums"
                      disabled={p.currency_code === "ZAR"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      value={p.buying_power_mult}
                      onChange={(e) =>
                        updateProfile(p.currency_code, "buying_power_mult", parseFloat(e.target.value) || 0)
                      }
                      className="h-8 w-24 ml-auto text-right tabular-nums"
                      disabled={p.currency_code === "ZAR"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      value={p.rounding_step}
                      onChange={(e) =>
                        updateProfile(p.currency_code, "rounding_step", parseFloat(e.target.value) || 0.01)
                      }
                      className="h-8 w-24 ml-auto text-right tabular-nums"
                      disabled={p.currency_code === "ZAR"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      value={p.min_value}
                      onChange={(e) =>
                        updateProfile(p.currency_code, "min_value", parseFloat(e.target.value) || 0)
                      }
                      className="h-8 w-24 ml-auto text-right tabular-nums"
                      disabled={p.currency_code === "ZAR"}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={p.notes ?? ""}
                      onChange={(e) => updateProfile(p.currency_code, "notes", e.target.value || null)}
                      className="h-8"
                      placeholder="—"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Rules viewer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pricing rules by currency</CardTitle>
          <CardDescription>
            Read-only view. To change ZAR base prices, use the Tenant admin
            "Pricing Rules" page. Then regenerate the other currencies here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              {currencyTabs.map((c) => (
                <TabsTrigger key={c} value={c}>
                  {c}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {(rulesByCurrency[c] || []).length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {currencyTabs.map((c) => (
              <TabsContent key={c} value={c} className="space-y-3">
                {c !== "ZAR" && (
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                    <div className="text-sm text-muted-foreground">
                      Derived from ZAR. Click regenerate to overwrite all{" "}
                      <span className="font-mono">{c}</span> rules using the
                      current ZAR prices and the {c} profile.
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => setConfirmCurrency(c)}
                      disabled={regenerating === c}
                    >
                      {regenerating === c ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4 mr-2" />
                      )}
                      Regenerate {c} from ZAR
                    </Button>
                  </div>
                )}

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Product family</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(rulesByCurrency[c] || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                            No {c} rules yet. Regenerate from ZAR.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (rulesByCurrency[c] || []).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {r.product_families?.name || "All"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {RULE_TYPE_LABELS[r.rule_type] || r.rule_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {formatPrice(Number(r.price_value), c)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={r.is_active ? "default" : "secondary"}>
                                {r.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!confirmCurrency}
        onOpenChange={(open) => !open && setConfirmCurrency(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate {confirmCurrency} pricing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all existing {confirmCurrency} pricing rules and
              recreate them from the current ZAR rules using the {confirmCurrency}
              currency profile. Manual {confirmCurrency} edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmCurrency && regenerate(confirmCurrency)}>
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
