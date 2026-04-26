import { useNavigate, useParams } from "react-router-dom";
import { useCart, useRemoveCartItem, useEditCartItem } from "@/hooks/useCart";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { formatPrice } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, ShoppingBag, ArrowRight, Plus, Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Cart() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: cart, isLoading } = useCart();
  const { region } = useRegionalPricing();
  // Prefer the currency stamped on the cart order itself (set at first add),
  // falling back to the active region for empty carts.
  const currency = (cart?.currency as string | undefined) ?? region?.currency_code ?? "ZAR";
  const removeItem = useRemoveCartItem();
  const editItem = useEditCartItem();
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());

  const items = (cart?.order_items as any[]) ?? [];

  const cartTotal = items.reduce(
    (sum, item) => sum + Number(item.unit_price) * item.quantity,
    0
  );

  const handleRemove = async (itemId: string) => {
    if (!cart) return;
    setRemovingIds((prev) => new Set(prev).add(itemId));
    try {
      await removeItem.mutateAsync({ orderItemId: itemId, cartOrderId: cart.id });
      toast.success("Item removed from cart");
    } catch (err: any) {
      toast.error("Failed to remove item", { description: err.message });
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleEdit = async (itemId: string) => {
    if (!cart) return;
    setEditingIds((prev) => new Set(prev).add(itemId));
    try {
      const draftOrderId = await editItem.mutateAsync({ orderItemId: itemId, cartOrderId: cart.id });
      navigate(`/t/${slug}/orders/${draftOrderId}/build`);
    } catch (err: any) {
      toast.error("Failed to edit item", { description: err.message });
      setEditingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!cart || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <ShoppingBag className="h-16 w-16 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Your cart is empty</h2>
        <p className="text-muted-foreground text-sm">Add items to your cart to get started.</p>
        <Button onClick={() => navigate(`/t/${slug}/orders/new`)}>
          <Plus className="h-4 w-4 mr-1" />
          Start New Order
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Shopping Cart</h1>
        <p className="text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"} in your cart
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-center">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item: any) => {
            const isRemoving = removingIds.has(item.id);
            const isEditing = editingIds.has(item.id);
            const productName = item.product_families?.name ?? "Document";
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <div>
                    <div className="font-medium text-foreground">{item.title || "Untitled"}</div>
                    <div className="text-xs text-muted-foreground">{productName}</div>
                  </div>
                </TableCell>
                <TableCell className="text-center text-foreground">{item.quantity}</TableCell>
                <TableCell className="text-right font-mono text-foreground">
                  {formatPrice(Number(item.unit_price), currency)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium text-foreground">
                  {formatPrice(Number(item.unit_price) * item.quantity, currency)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(item.id)}
                      disabled={isEditing || isRemoving}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      title="Edit item"
                    >
                      {isEditing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleRemove(item.id)}
                      disabled={isRemoving || isEditing}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title="Remove item"
                    >
                      {isRemoving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Cart footer */}
      <div className="flex flex-col items-end gap-4 border-t border-border pt-4">
        <div className="text-right space-y-1">
          <div className="text-sm text-muted-foreground">Subtotal (excl. VAT)</div>
          <div className="text-2xl font-bold text-foreground">{formatPrice(cartTotal, currency)}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/t/${slug}/orders/new`)}>
            <Plus className="h-4 w-4 mr-1" />
            Add More Items
          </Button>
          <Button size="lg" onClick={() => navigate(`/t/${slug}/checkout`)}>
            Proceed to Checkout
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
