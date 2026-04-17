import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Mail, Phone, Trash2, MessageSquare } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useTenantCustomer, useCustomerNotes } from "@/hooks/useTenantCustomers";
import { useTenantContext } from "@/hooks/useTenantContext";
import { buildAdminPath } from "@/lib/adminRouting";

const ZAR = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

export default function AdminCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenantContext();
  const { data, isLoading } = useTenantCustomer(id);
  const notes = useCustomerNotes(id);
  const [noteBody, setNoteBody] = useState("");

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { profile, membership, orders, addresses, history } = data;
  const name =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email?.split("@")[0] ||
    "Customer";

  const lifetimeValue = orders.reduce((sum, o: any) => sum + Number(o.total_amount ?? 0), 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          to={buildAdminPath("/admin/customers", tenantId)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All customers
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{name}</h1>
        <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
          {profile?.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              {profile.email}
            </span>
          )}
          {profile?.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {profile.phone}
            </span>
          )}
          {membership && (
            <Badge variant={membership.is_active ? "default" : "secondary"}>
              {membership.is_active ? "Active" : "Inactive"}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Lifetime value</div>
          <div className="text-2xl font-semibold">{ZAR.format(lifetimeValue)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Orders</div>
          <div className="text-2xl font-semibold">{orders.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Last order</div>
          <div className="text-2xl font-semibold">
            {orders[0]
              ? formatDistanceToNow(new Date((orders[0] as any).created_at), { addSuffix: true })
              : "—"}
          </div>
        </Card>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card>
            {orders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No orders yet.</div>
            ) : (
              <div className="divide-y">
                {orders.map((o: any) => (
                  <Link
                    key={o.id}
                    to={buildAdminPath(`/admin/orders/${o.id}`, tenantId)}
                    className="flex items-center justify-between p-4 hover:bg-muted/40"
                  >
                    <div>
                      <div className="font-medium">{o.order_number ?? o.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(o.created_at), "PP")} · {o.customer_status}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{ZAR.format(Number(o.total_amount ?? 0))}</div>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {o.payment_status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="addresses">
          <Card>
            {addresses.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No addresses on file.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                {addresses.map((a: any) => (
                  <div key={a.id} className="rounded-lg border p-4">
                    <div className="text-xs uppercase text-muted-foreground mb-1">
                      {a.address_type}
                    </div>
                    {a.contact_name && <div className="font-medium">{a.contact_name}</div>}
                    {a.company_name && <div>{a.company_name}</div>}
                    {a.line1 && <div>{a.line1}</div>}
                    {a.line2 && <div>{a.line2}</div>}
                    <div>
                      {[a.suburb, a.city, a.postal_code].filter(Boolean).join(", ")}
                    </div>
                    {a.country && <div className="text-muted-foreground">{a.country}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            {history.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No activity yet.</div>
            ) : (
              <div className="divide-y">
                {history.map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between p-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">{h.entity_type}</span>{" "}
                      <span className="font-medium">
                        {h.from_status ? `${h.from_status} → ${h.to_status}` : h.to_status}
                      </span>
                      {h.reason && (
                        <div className="text-xs text-muted-foreground">{h.reason}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="p-4 space-y-4">
            <div className="space-y-2">
              <Textarea
                placeholder="Add an internal note about this customer…"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!noteBody.trim() || notes.addNote.isPending}
                  onClick={() =>
                    notes.addNote.mutate(noteBody.trim(), {
                      onSuccess: () => setNoteBody(""),
                    })
                  }
                >
                  Add note
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {(notes.data ?? []).length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-6">
                  <MessageSquare className="mx-auto h-6 w-6 opacity-40 mb-2" />
                  No notes yet.
                </div>
              ) : (
                (notes.data ?? []).map((n: any) => (
                  <div key={n.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => notes.deleteNote.mutate(n.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
