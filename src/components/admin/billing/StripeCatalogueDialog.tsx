import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StripeCatalogItem {
  price_id: string;
  product_id: string | null;
  product_name: string;
  product_active: boolean;
  currency: string;
  unit_amount: number | null;
  unit_amount_decimal: string | null;
  recurring: { interval: string; interval_count: number } | null;
  active: boolean;
  nickname: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  planName: string;
  currentPriceId?: string | null;
  currency?: string | null;
}

export function StripeCatalogueDialog({ open, onOpenChange, planId, planName, currentPriceId, currency }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [alsoUpdateName, setAlsoUpdateName] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["stripe_catalogue", currency ?? "all"],
    enabled: open,
    queryFn: async (): Promise<StripeCatalogItem[]> => {
      const qs = currency ? `?currency=${encodeURIComponent(currency.toLowerCase())}` : "";
      const { data, error } = await supabase.functions.invoke(`stripe-list-catalog${qs}`, { method: "GET" as any });
      if (error) throw new Error(error.message);
      return ((data as any)?.items ?? []) as StripeCatalogItem[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((i) =>
      [i.product_name, i.nickname ?? "", i.price_id, i.product_id ?? ""].some((s) => s.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const attach = async (item: StripeCatalogItem) => {
    setAttaching(item.price_id);
    try {
      const updates: Record<string, any> = {
        stripe_price_id: item.price_id,
        price: item.unit_amount != null ? item.unit_amount / 100 : 0,
      };
      if (alsoUpdateName && item.product_name) updates.plan_name = item.product_name;
      const { error } = await supabase.from("platform_pricing_plans").update(updates as any).eq("id", planId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["platform_pricing_plans"] });
      qc.invalidateQueries({ queryKey: ["branch_plans"] });
      qc.invalidateQueries({ queryKey: ["branch_plans", "region"] });
      toast.success(`Attached ${item.price_id} to ${planName}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to attach");
    } finally {
      setAttaching(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Stripe catalogue</DialogTitle>
          <DialogDescription>
            Pick any active recurring price from Stripe and attach it to <span className="font-medium">{planName}</span>.
            {currency && <> Filtered to <span className="font-mono">{currency.toUpperCase()}</span>.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input placeholder="Search product, price ID, nickname…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Reload
          </Button>
          <label className="flex items-center gap-2 text-xs whitespace-nowrap">
            <Checkbox checked={alsoUpdateName} onCheckedChange={(v) => setAlsoUpdateName(!!v)} />
            Also update plan label
          </label>
        </div>

        <div className="flex-1 overflow-auto border rounded-md">
          {isLoading ? (
            <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading catalogue…
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No matching prices.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-left">
                  <th className="p-2 font-medium">Product</th>
                  <th className="p-2 font-medium">Price</th>
                  <th className="p-2 font-medium">Interval</th>
                  <th className="p-2 font-medium">Price ID</th>
                  <th className="p-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const isCurrent = i.price_id === currentPriceId;
                  return (
                    <tr key={i.price_id} className="border-t hover:bg-muted/30">
                      <td className="p-2">
                        <div className="font-medium">{i.product_name}</div>
                        {i.nickname && <div className="text-xs text-muted-foreground">{i.nickname}</div>}
                        {!i.product_active && <Badge variant="destructive" className="mt-1 text-[10px]">Product inactive</Badge>}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {i.currency} {i.unit_amount_decimal ?? "—"}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {i.recurring ? `every ${i.recurring.interval_count > 1 ? `${i.recurring.interval_count} ` : ""}${i.recurring.interval}` : "—"}
                      </td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">{i.price_id}</td>
                      <td className="p-2 text-right">
                        {isCurrent ? (
                          <Badge variant="secondary">Current</Badge>
                        ) : (
                          <Button size="sm" onClick={() => attach(i)} disabled={attaching !== null}>
                            {attaching === i.price_id && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                            Attach
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
