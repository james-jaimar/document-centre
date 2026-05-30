import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { ADMIN_STATUS_CONFIG } from "@/lib/orders/status-maps";
import { updateOrderStatus } from "@/lib/orders/mutations";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, Loader2, Truck, PackageCheck } from "lucide-react";

type AdminStatus = keyof typeof ADMIN_STATUS_CONFIG;

interface Props {
  order: {
    id: string;
    admin_status: AdminStatus;
    fulfillment_type?: "delivery" | "collection" | null;
    tracking_number?: string | null;
    tracking_carrier?: string | null;
    dispatched_at?: string | null;
  };
}

/** Primary forward actions for each status. Returns ordered list of next legal steps. */
const PRIMARY_NEXT: Record<AdminStatus, Array<{ status: AdminStatus; label: string }>> = {
  new_order: [
    { status: "under_review", label: "Start Review" },
    { status: "approved", label: "Approve" },
  ],
  under_review: [{ status: "approved", label: "Approve" }],
  approved: [{ status: "in_production", label: "Start Production" }],
  in_production: [{ status: "qa", label: "Move to QA" }],
  qa: [{ status: "ready_for_dispatch", label: "Mark Ready" }],
  ready_for_dispatch: [{ status: "completed", label: "Mark Completed" }],
  dispatched: [{ status: "completed", label: "Mark Delivered" }],
  completed: [],
  on_hold: [{ status: "in_production", label: "Resume" }],
  cancelled: [],
};

const SECONDARY: AdminStatus[] = ["on_hold", "cancelled"];

export function OrderWorkflowPanel({ order }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [carrier, setCarrier] = useState(order.tracking_carrier ?? "");
  const [trackingNo, setTrackingNo] = useState(order.tracking_number ?? "");

  const isDelivery = order.fulfillment_type === "delivery";
  const isCollection = order.fulfillment_type === "collection";

  async function transition(
    status: AdminStatus,
    extra: { reason?: string; tracking_number?: string; tracking_carrier?: string } = {},
  ) {
    setBusy(true);
    try {
      await updateOrderStatus({ order_id: order.id, admin_status: status, ...extra });
      toast({ title: "Order updated", description: `Status set to ${ADMIN_STATUS_CONFIG[status].label}.` });
      await qc.invalidateQueries({ queryKey: ["order-detail"] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      setConfirmCancel(false);
      setShowDispatchForm(false);
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e?.message || "Could not update order status",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const primary = PRIMARY_NEXT[order.admin_status] ?? [];
  // When ready for dispatch on a delivery order, swap "Mark Completed" for the dispatch flow
  const showDispatchAction =
    order.admin_status === "ready_for_dispatch" && isDelivery;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Workflow
        </span>
        <StatusBadge {...ADMIN_STATUS_CONFIG[order.admin_status]} />
      </div>

      {/* Dispatched info */}
      {order.admin_status === "dispatched" && order.tracking_number && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5" />
          {order.tracking_carrier ? `${order.tracking_carrier} · ` : ""}
          <span className="font-mono">{order.tracking_number}</span>
        </div>
      )}

      {/* Collection ready hint */}
      {order.admin_status === "ready_for_dispatch" && isCollection && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <PackageCheck className="h-3.5 w-3.5" />
          Customer notified — ready for collection email sent.
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5">
        {primary.map((p) => (
          <Button
            key={p.status}
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => transition(p.status)}
          >
            {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {p.label}
          </Button>
        ))}

        {showDispatchAction && (
          <Button
            size="sm"
            className="h-7 text-xs"
            variant="default"
            disabled={busy}
            onClick={() => setShowDispatchForm((v) => !v)}
          >
            <Truck className="h-3 w-3 mr-1" />
            Dispatch & Notify
          </Button>
        )}

        {/* More dropdown for on_hold / cancel */}
        {(order.admin_status !== "completed" && order.admin_status !== "cancelled") && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy}>
                More <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SECONDARY.filter((s) => s !== order.admin_status).map((s) =>
                s === "cancelled" ? (
                  <DropdownMenuItem
                    key={s}
                    className="text-destructive"
                    onClick={() => setConfirmCancel(true)}
                  >
                    Cancel order
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={s} onClick={() => transition(s)}>
                    {ADMIN_STATUS_CONFIG[s].label}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Dispatch form */}
      {showDispatchForm && showDispatchAction && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Carrier</Label>
              <Input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="e.g. The Courier Guy"
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">Tracking number</Label>
              <Input
                value={trackingNo}
                onChange={(e) => setTrackingNo(e.target.value)}
                placeholder="Required"
                className="h-7 text-xs"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="h-7 text-xs w-full"
            disabled={busy || !trackingNo.trim()}
            onClick={() =>
              transition("dispatched", {
                tracking_number: trackingNo.trim(),
                tracking_carrier: carrier.trim() || undefined,
              })
            }
          >
            {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Mark Dispatched & Email Customer
          </Button>
        </div>
      )}

      {/* Cancel confirmation */}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Reason (required)</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Why is this order being cancelled?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={busy}>
              Keep order
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !cancelReason.trim()}
              onClick={() => transition("cancelled", { reason: cancelReason.trim() })}
            >
              {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
