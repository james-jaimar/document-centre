import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  useOutgoingSupplierLinks,
  useIncomingSupplierLinks,
  useCreateSupplierInvite,
  useRevokeSupplierLink,
  useAcceptSupplierInvite,
  useSupplierOfferings,
  useUpsertSupplierOffering,
  useSupplierCatalogue,
  useSupplierTradeBlocks,
  useProductSupplierAssignments,
  useUpsertProductSupplierAssignment,
  useDeleteProductSupplierAssignment,
} from "@/hooks/useSupplierNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Copy, Truck, Store } from "lucide-react";

function money(minor: number | undefined | null) {
  const v = (minor ?? 0) / 100;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminSuppliers() {
  const { tenantId } = useTenantContext();
  if (!tenantId) {
    return <div className="p-6 text-sm text-muted-foreground">No active tenant.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Suppliers &amp; trade partners</h1>
        <p className="text-sm text-muted-foreground">
          Buy from another business on the platform, or offer your own printing to them wholesale.
        </p>
      </div>

      <Tabs defaultValue="buying">
        <TabsList>
          <TabsTrigger value="buying" className="gap-2"><Truck size={16} /> My suppliers</TabsTrigger>
          <TabsTrigger value="selling" className="gap-2"><Store size={16} /> I supply others</TabsTrigger>
        </TabsList>

        <TabsContent value="buying" className="space-y-6 pt-4">
          <BuyingTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="selling" className="space-y-6 pt-4">
          <SellingTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================ SUPPLIER SIDE */

function SellingTab({ tenantId }: { tenantId: string }) {
  const { data: links = [] } = useOutgoingSupplierLinks(tenantId);
  const createInvite = useCreateSupplierInvite();
  const revoke = useRevokeSupplierLink();
  const [companyId, setCompanyId] = useState<string>("none");

  const { data: companies = [] } = useQuery({
    queryKey: ["supplier_invite_companies", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_companies")
        .select("id,name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast({ title: "Invite code copied" });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Invite a trade partner</CardTitle>
          <CardDescription>
            Generate a one-time code and send it to the business. They enter it in their own
            account to link up. Codes expire after 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>Link to a company on your books (optional)</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="No company" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">No company</SelectItem>
                  {companies.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={createInvite.isPending}
              onClick={() =>
                createInvite.mutate(
                  { supplier_tenant_id: tenantId, buyer_company_id: companyId === "none" ? null : companyId },
                  {
                    onSuccess: (l) => toast({ title: "Invite created", description: l.invite_code }),
                    onError: (e: any) => toast({ title: "Could not create invite", description: e.message, variant: "destructive" }),
                  },
                )
              }
            >
              Create invite
            </Button>
          </div>

          <Separator />

          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trade partners yet.</p>
          ) : (
            <div className="space-y-2">
              {links.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                  <Badge variant={l.status === "active" ? "default" : l.status === "revoked" ? "destructive" : "secondary"}>
                    {l.status}
                  </Badge>
                  <span className="text-sm font-medium">
                    {l.buyer?.name ?? l.company?.name ?? "Awaiting acceptance"}
                  </span>
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">{l.invite_code}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(l.invite_code)}>
                    <Copy size={14} />
                  </Button>
                  <div className="ml-auto">
                    {l.status !== "revoked" && (
                      <Button size="sm" variant="outline" onClick={() => revoke.mutate(l.id)}>
                        {l.status === "active" ? "End partnership" : "Withdraw"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WholesaleCatalogue tenantId={tenantId} />
    </>
  );
}

function WholesaleCatalogue({ tenantId }: { tenantId: string }) {
  const { data: families = [], isLoading } = useProductFamilies(null, { masterOnly: true });
  const { data: offerings = [] } = useSupplierOfferings(tenantId);
  const upsert = useUpsertSupplierOffering();

  const byFamily = useMemo(() => {
    const m = new Map<string, (typeof offerings)[number]>();
    offerings.forEach((o) => m.set(o.product_family_id, o));
    return m;
  }, [offerings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wholesale catalogue</CardTitle>
        <CardDescription>
          Switch on the products your trade partners may resell. They see your trade prices as a
          locked cost and add their own markup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading products…</p>}
        {families.map((f) => {
          const o = byFamily.get(f.id);
          return (
            <div key={f.id} className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3">
              <Switch
                checked={!!o?.is_offered}
                onCheckedChange={(v) =>
                  upsert.mutate({
                    supplier_tenant_id: tenantId,
                    product_family_id: f.id,
                    is_offered: v,
                    lead_time_days: o?.lead_time_days ?? null,
                    min_quantity: o?.min_quantity ?? null,
                    notes: o?.notes ?? null,
                  })
                }
              />
              <span className="text-sm font-medium flex-1 min-w-[10rem]">{f.name}</span>
              {o?.is_offered && (
                <>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Lead time (days)</Label>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      defaultValue={o.lead_time_days ?? ""}
                      onBlur={(e) =>
                        upsert.mutate({
                          supplier_tenant_id: tenantId,
                          product_family_id: f.id,
                          is_offered: true,
                          lead_time_days: e.target.value === "" ? null : Number(e.target.value),
                          min_quantity: o.min_quantity ?? null,
                          notes: o.notes ?? null,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Min qty</Label>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      defaultValue={o.min_quantity ?? ""}
                      onBlur={(e) =>
                        upsert.mutate({
                          supplier_tenant_id: tenantId,
                          product_family_id: f.id,
                          is_offered: true,
                          lead_time_days: o.lead_time_days ?? null,
                          min_quantity: e.target.value === "" ? null : Number(e.target.value),
                          notes: o.notes ?? null,
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* =============================================================== BUYER SIDE */

function BuyingTab({ tenantId }: { tenantId: string }) {
  const { data: links = [] } = useIncomingSupplierLinks(tenantId);
  const accept = useAcceptSupplierInvite();
  const [code, setCode] = useState("");

  const activeLinks = links.filter((l) => l.status === "active");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add a supplier</CardTitle>
          <CardDescription>Enter the invite code your supplier sent you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Invite code</Label>
              <Input
                className="w-56 font-mono uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCDE-FGHIJ"
              />
            </div>
            <Button
              disabled={!code.trim() || accept.isPending}
              onClick={() =>
                accept.mutate(
                  { code: code.trim(), buyerTenantId: tenantId },
                  {
                    onSuccess: () => {
                      setCode("");
                      toast({ title: "Supplier added" });
                    },
                    onError: (e: any) =>
                      toast({ title: "Could not add supplier", description: e.message, variant: "destructive" }),
                  },
                )
              }
            >
              Add supplier
            </Button>
          </div>

          {links.length > 0 && (
            <div className="space-y-2">
              {links.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge>
                  <span className="text-sm font-medium">{l.supplier?.name ?? "Supplier"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {activeLinks.length > 0 && (
        <OutsourcedProducts tenantId={tenantId} links={activeLinks.map((l) => ({ id: l.id, name: l.supplier?.name ?? "Supplier" }))} />
      )}
    </>
  );
}

function OutsourcedProducts({
  tenantId,
  links,
}: {
  tenantId: string;
  links: { id: string; name: string }[];
}) {
  const { data: families = [] } = useProductFamilies(null, { masterOnly: true });
  const { data: assignments = [] } = useProductSupplierAssignments(tenantId);
  const upsert = useUpsertProductSupplierAssignment();
  const remove = useDeleteProductSupplierAssignment();

  const byFamily = useMemo(() => {
    const m = new Map<string, (typeof assignments)[number]>();
    assignments.forEach((a) => m.set(a.product_family_id, a));
    return m;
  }, [assignments]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outsourced products</CardTitle>
        <CardDescription>
          Mark a product as printed by a supplier. Their trade price becomes your locked cost —
          you set your own selling price in Catalogue Pricing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {families.map((f) => (
          <ProductRow
            key={f.id}
            tenantId={tenantId}
            familyId={f.id}
            familyName={f.name}
            links={links}
            assignment={byFamily.get(f.id) ?? null}
            onAssign={(linkId, supplierFamilyId) =>
              upsert.mutate({
                tenant_id: tenantId,
                product_family_id: f.id,
                supplier_link_id: linkId,
                supplier_product_family_id: supplierFamilyId,
              })
            }
            onClear={() => remove.mutate({ tenantId, productFamilyId: f.id })}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ProductRow({
  familyId,
  familyName,
  links,
  assignment,
  onAssign,
  onClear,
}: {
  tenantId: string;
  familyId: string;
  familyName: string;
  links: { id: string; name: string }[];
  assignment: { supplier_link_id: string; supplier_product_family_id: string } | null;
  onAssign: (linkId: string, supplierFamilyId: string) => void;
  onClear: () => void;
}) {
  const [linkId, setLinkId] = useState<string>(assignment?.supplier_link_id ?? "");
  const effectiveLinkId = assignment?.supplier_link_id ?? linkId;
  const { data: catalogue = [] } = useSupplierCatalogue(effectiveLinkId || null);
  const { data: tradeBlocks = [] } = useSupplierTradeBlocks(
    assignment?.supplier_link_id ?? null,
    assignment?.supplier_product_family_id ?? null,
  );

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium flex-1 min-w-[10rem]">{familyName}</span>

        <Select value={effectiveLinkId} onValueChange={setLinkId}>
          <SelectTrigger className="h-8 w-52"><SelectValue placeholder="Printed in-house" /></SelectTrigger>
          <SelectContent>
            {links.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={assignment?.supplier_product_family_id ?? ""}
          onValueChange={(v) => effectiveLinkId && onAssign(effectiveLinkId, v)}
          disabled={!effectiveLinkId}
        >
          <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Their product" /></SelectTrigger>
          <SelectContent className="max-h-72">
            {catalogue.map((c) => (
              <SelectItem key={c.product_family_id} value={c.product_family_id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {assignment && (
          <Button size="sm" variant="ghost" onClick={onClear}>Bring in-house</Button>
        )}
      </div>

      {assignment && tradeBlocks.length > 0 && (
        <TradeCostTable blocks={tradeBlocks} familyId={familyId} />
      )}
    </div>
  );
}

function TradeCostTable({ blocks }: { blocks: QuantityBlock[]; familyId: string }) {
  const rows = [...blocks].sort((a, b) => a.qty - b.qty).slice(0, 40);
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Locked supplier cost (ex VAT) — read-only
      </p>
      <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((b, i) => (
          <div key={i} className="flex justify-between border-b border-border/50 py-0.5">
            <span className="text-muted-foreground">
              {[b.size, b.paper, b.option].filter((v) => v && v !== "*").join(" · ")} × {b.qty}
            </span>
            <span className="font-mono">{money(b.trade_price_minor || b.price_minor)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
