import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useTenantSettingsMap, useBulkUpsertTenantSettings } from "@/hooks/useTenantSettings";
import { SUPPORTED_CURRENCIES } from "@/lib/countries";
import { toast } from "sonner";
import { Save, Receipt, Coins, Ruler } from "lucide-react";

export function FinancialTab() {
  const { settingsMap, isLoading } = useTenantSettingsMap("financial");
  const { settingsMap: regionalMap, isLoading: regionalLoading } = useTenantSettingsMap("regional");
  const bulkUpsert = useBulkUpsertTenantSettings();

  const [taxEnabled, setTaxEnabled] = useState(true);
  const [taxLabel, setTaxLabel] = useState("VAT");
  const [taxRate, setTaxRate] = useState("15");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [invoiceNextNumber, setInvoiceNextNumber] = useState("1001");
  const [defaultCurrency, setDefaultCurrency] = useState("ZAR");
  const [lockCurrency, setLockCurrency] = useState(true);
  const [multiCurrency, setMultiCurrency] = useState(false);
  const [acceptedCurrencies, setAcceptedCurrencies] = useState<string[]>([]);
  const [measurementUnit, setMeasurementUnit] = useState("auto");

  useEffect(() => {
    if (!regionalLoading && regionalMap) {
      const raw = String(regionalMap.measurement_unit ?? "auto").toLowerCase();
      setMeasurementUnit(raw === "metric" || raw === "imperial" ? raw : "auto");
    }
  }, [regionalLoading, regionalMap]);

  useEffect(() => {
    if (!isLoading && settingsMap) {
      // Default tax_enabled to true when a non-zero rate is configured.
      const rate = Number(settingsMap.tax_rate ?? 15);
      setTaxEnabled(
        settingsMap.tax_enabled === undefined || settingsMap.tax_enabled === null
          ? rate > 0
          : settingsMap.tax_enabled === true,
      );
      setTaxLabel((settingsMap.tax_label as string) ?? "VAT");
      setTaxRate(String(rate));
      setTaxInclusive(settingsMap.tax_inclusive === true);
      setInvoicePrefix((settingsMap.invoice_prefix as string) ?? "INV");
      setInvoiceNextNumber(String(settingsMap.invoice_next_number ?? 1001));
      setDefaultCurrency(((settingsMap.default_currency_code as string) ?? "ZAR").toUpperCase());
      setLockCurrency(
        settingsMap.lock_currency === undefined || settingsMap.lock_currency === null
          ? true
          : settingsMap.lock_currency === true,
      );
      setMultiCurrency(settingsMap.multi_currency_enabled === true);
      setAcceptedCurrencies(
        Array.isArray(settingsMap.accepted_currencies)
          ? (settingsMap.accepted_currencies as unknown[]).map((c) => String(c).toUpperCase())
          : [],
      );
    }
  }, [isLoading, settingsMap]);

  const handleSave = async () => {
    try {
      await bulkUpsert.mutateAsync([
        { category: "financial", setting_key: "tax_enabled", setting_value: taxEnabled, value_type: "boolean" },
        { category: "financial", setting_key: "tax_label", setting_value: taxLabel, value_type: "string" },
        { category: "financial", setting_key: "tax_rate", setting_value: parseFloat(taxRate), value_type: "number" },
        { category: "financial", setting_key: "tax_inclusive", setting_value: taxInclusive, value_type: "boolean" },
        { category: "financial", setting_key: "invoice_prefix", setting_value: invoicePrefix, value_type: "string" },
        { category: "financial", setting_key: "invoice_next_number", setting_value: parseInt(invoiceNextNumber), value_type: "number" },
        { category: "financial", setting_key: "default_currency_code", setting_value: defaultCurrency, value_type: "string" },
        { category: "financial", setting_key: "lock_currency", setting_value: multiCurrency ? false : lockCurrency, value_type: "boolean" },
        { category: "financial", setting_key: "multi_currency_enabled", setting_value: multiCurrency, value_type: "boolean" },
        {
          category: "financial",
          setting_key: "accepted_currencies",
          setting_value: multiCurrency
            ? Array.from(new Set([defaultCurrency, ...acceptedCurrencies]))
            : [],
          value_type: "json",
        },
        { category: "regional", setting_key: "measurement_unit", setting_value: measurementUnit, value_type: "string" },
      ]);
      toast.success("Financial settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5" /> Currency</CardTitle>
          <CardDescription>
            Your default currency is the one your rate cards are priced in. Lock it, or opt in to
            selling in several currencies with prices converted automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 max-w-2xl">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Default currency</Label>
              <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-3 pt-6">
              <Switch checked={lockCurrency} onCheckedChange={setLockCurrency} disabled={multiCurrency} />
              <div className="space-y-0.5">
                <Label>Lock to this currency</Label>
                <p className="text-xs text-muted-foreground">
                  Recommended. When on, geo-detection and manual region switching are ignored — every order, quote and invoice uses your default currency.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Switch
                checked={multiCurrency}
                onCheckedChange={(v) => {
                  setMultiCurrency(v);
                  if (v) setLockCurrency(false);
                }}
              />
              <div className="space-y-0.5">
                <Label>Sell in multiple currencies</Label>
                <p className="text-xs text-muted-foreground">
                  Visitors are shown prices in their local currency (detected from their location, and
                  changeable from the storefront header). Prices are converted from your rate cards
                  using the platform exchange rates, and the order, invoice and payment are all taken
                  in the currency the customer chose.
                </p>
              </div>
            </div>

            {multiCurrency && (
              <div className="space-y-3 pl-11">
                <Label>Currencies you accept</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUPPORTED_CURRENCIES.map((c) => {
                    const isBase = c.code === defaultCurrency;
                    const checked = isBase || acceptedCurrencies.includes(c.code);
                    return (
                      <label key={c.code} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={isBase}
                          onCheckedChange={(v) =>
                            setAcceptedCurrencies((prev) =>
                              v === true
                                ? Array.from(new Set([...prev, c.code]))
                                : prev.filter((x) => x !== c.code),
                            )
                          }
                        />
                        <span>{c.label}{isBase ? " — base" : ""}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Re-check your canvas, photo and business-card rate cards after switching this on —
                  those prices are converted from your base currency, not authored per currency.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Tax Configuration</CardTitle>
          <CardDescription>How tax is calculated and displayed on orders and invoices</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
            <Label>Charge tax</Label>
          </div>
          <div className="space-y-2">
            <Label>Tax Label</Label>
            <Input value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} placeholder="e.g. VAT, GST" disabled={!taxEnabled} />
          </div>
          <div className="space-y-2">
            <Label>Tax Rate (%)</Label>
            <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} disabled={!taxEnabled} />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={taxInclusive} onCheckedChange={setTaxInclusive} disabled={!taxEnabled} />
            <Label>Tax-inclusive pricing</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Numbering</CardTitle>
          <CardDescription>
            Default prefix and next number for invoice generation. Individual
            branches can override these under Branch Settings → Operations.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 max-w-lg">
          <div className="space-y-2">
            <Label>Invoice Prefix</Label>
            <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label>Next Invoice Number</Label>
            <Input type="number" value={invoiceNextNumber} onChange={(e) => setInvoiceNextNumber(e.target.value)} className="font-mono" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Ruler className="h-5 w-5" /> Measurement Units &amp; Locale</CardTitle>
          <CardDescription>
            The default measurement system for this tenant, and therefore which master
            catalogue (metric or imperial) your branches are cloned from. Any branch can
            override this under Branches → the branch → Regional, so you can run a metric
            branch and an imperial branch side by side.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-md space-y-2">
          <Label>Display units</Label>
          <Select value={measurementUnit} onValueChange={setMeasurementUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic (follow storefront region)</SelectItem>
              <SelectItem value="metric">Metric — mm, gsm (A4, A3, DL)</SelectItem>
              <SelectItem value="imperial">Imperial — inches, lb (Letter, Legal, Tabloid)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Automatic switches to inches and pound stock weights for US and Canadian
            storefront regions, and stays metric everywhere else. A branch that sets its
            own measurement system ignores this setting entirely — its catalogue and its
            labels follow the branch.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={bulkUpsert.isPending}>
          <Save className="mr-2 h-4 w-4" /> Save Changes
        </Button>
      </div>
    </div>
  );
}
