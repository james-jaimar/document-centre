import { useState } from "react";
import { BookPlus, Loader2 } from "lucide-react";
import { useBookshelf } from "@/hooks/useBookshelf";
import { useAuth } from "@/hooks/useAuth";
import { isAnonymousUser } from "@/lib/tenantSignOut";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { bookshelfCategoryNames } from "@/lib/bookshelfGroups";

export default function BookshelfSaveButton({ orderItemId, name, shelfId, disabled, beforeSave }: {
  orderItemId: string; name: string; shelfId?: string; disabled?: boolean; beforeSave: () => Promise<unknown>;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const shelf = useBookshelf();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(name);
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  if (shelf.feature.data !== true || !user || isAnonymousUser(user)) return null;
  const existing = shelf.data?.find(item => item.id === shelfId);
  const categoryNames = bookshelfCategoryNames(shelf.data ?? []);
  const save = async () => {
    setSaving(true);
    try {
      await beforeSave();
      await shelf.operation.mutateAsync({ operation: shelfId ? "revise" : "create", id: shelfId, order_item_id: orderItemId, name: title.trim(), sku: sku.trim(), category: category.trim() });
      setOpen(false);
      toast.success(shelfId ? "Bookshelf product updated" : "Saved to your bookshelf", {
        action: { label: "View bookshelf", onClick: () => navigate(tenantPath("bookshelf")) },
      });
      if (shelfId) navigate(tenantPath("bookshelf"));
    } catch (error) {
      if (!shelf.operation.isError) toast.error(error instanceof Error ? error.message : "Could not save your product");
    } finally { setSaving(false); }
  };
  return <>
    <Button className="w-full mt-2 gap-2" variant="outline" disabled={disabled || saving} onClick={() => {
      setTitle(existing?.name || name); setSku(existing?.sku || ""); setCategory(existing?.snapshot.shelf_category || ""); setOpen(true);
    }}><BookPlus className="h-4 w-4" />{shelfId ? "Update bookshelf" : "Save to My Bookshelf"}</Button>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{shelfId ? "Update bookshelf product" : "Save to My Bookshelf"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="bookshelf-name">Product name</Label><Input id="bookshelf-name" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} /></div>
          <div className="space-y-2"><Label htmlFor="bookshelf-category">Shelf / category</Label><Input id="bookshelf-category" list="bookshelf-category-list" placeholder="Pick a shelf or type a new one" value={category} onChange={e => setCategory(e.target.value)} maxLength={80} /><datalist id="bookshelf-category-list">{categoryNames.map(n => <option key={n} value={n} />)}</datalist><p className="text-xs text-muted-foreground">Choose an existing shelf or type a new name to create one.</p></div>
          <div className="space-y-2"><Label htmlFor="bookshelf-sku">SKU / reference (optional)</Label><Input id="bookshelf-sku" value={sku} onChange={e => setSku(e.target.value)} maxLength={80} /></div>
        </div>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || !title.trim() || !category.trim()} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving…" : "Save product"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}