import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BookOpen, Plus, Search, Pencil, Trash2, Loader2, ShoppingCart, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useBookshelf, type BookshelfItem } from "@/hooks/useBookshelf";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import BookshelfRow, { BookshelfCover } from "@/components/customer/BookshelfRow";
import { groupBookshelfItems, bookshelfCategoryNames } from "@/lib/bookshelfGroups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function CustomerBookshelf() {
  const shelf = useBookshelf();
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<BookshelfItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BookshelfItem | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [shelfName, setShelfName] = useState("");
  const [shelfEdit, setShelfEdit] = useState<{ from: string; items: BookshelfItem[] } | null>(null);
  const [shelfRename, setShelfRename] = useState("");
  const [shelfBusy, setShelfBusy] = useState(false);
  const [shelfDelete, setShelfDelete] = useState<{ from: string; items: BookshelfItem[] } | null>(null);
  const [shelfTarget, setShelfTarget] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const moveItem = async (item: BookshelfItem, to: string) => {
    const target = to.trim(); if (!target) return;
    try { await shelf.operation.mutateAsync({ operation: "rename", id: item.id, name: item.name, sku: item.sku ?? "", category: target }); setSelected(prev => prev && prev.id === item.id ? { ...prev, snapshot: { ...prev.snapshot, shelf_category: target } } : prev); toast.success(`Moved to ${target}`); } catch { /* reported */ }
  };
  const deleteShelf = async () => {
    if (!shelfDelete || !shelfTarget.trim() || shelfTarget.trim() === shelfDelete.from) return;
    setShelfBusy(true);
    try {
      for (const item of shelfDelete.items) await shelf.operation.mutateAsync({ operation: "rename", id: item.id, name: item.name, sku: item.sku ?? "", category: shelfTarget.trim() });
      if (category === shelfDelete.from) setCategory("all");
      setShelfDelete(null); toast.success(`Shelf deleted, products moved to ${shelfTarget.trim()}`);
    } catch { /* reported */ } finally { setShelfBusy(false); }
  };
  const renameShelf = async () => {
    if (!shelfEdit || !shelfRename.trim()) return;
    setShelfBusy(true);
    try {
      for (const item of shelfEdit.items) await shelf.operation.mutateAsync({ operation: "rename", id: item.id, name: item.name, sku: item.sku ?? "", category: shelfRename.trim() });
      if (category === shelfEdit.from) setCategory("all");
      setShelfEdit(null); toast.success("Shelf renamed");
    } catch { /* reported */ } finally { setShelfBusy(false); }
  };
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const items = (shelf.data ?? []).filter(item => `${item.name} ${item.sku ?? ""} ${item.snapshot.product_name}`.toLowerCase().includes(search.toLowerCase()));
  const categories = groupBookshelfItems(shelf.data ?? []);
  const groups = groupBookshelfItems(items).filter(group => category === "all" || group.name === category);
  const restore = async (item: BookshelfItem, revise: boolean) => {
    const quantity = Number(quantities[item.id] ?? item.snapshot.spec.quantity ?? 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1) { toast.error("Enter a whole number of copies greater than zero"); return; }
    setBusyId(item.id);
    try {
      const result = await shelf.operation.mutateAsync({ operation: "restore", id: item.id, quantity });
      if (!result.order_id) throw new Error("Could not open your product");
      navigate(tenantPath(`orders/${result.order_id}/${revise ? "files" : "build?express=bookshelf"}`));
    } catch { /* operation reports its error */ } finally { setBusyId(null); }
  };
  if (shelf.feature.isLoading) return <Skeleton className="h-40 w-full" />;
  if (shelf.feature.isError) return <div className="space-y-3"><p className="text-destructive">Could not load your bookshelf.</p><Button variant="outline" onClick={() => shelf.feature.refetch()}>Retry</Button></div>;
  if (shelf.feature.data !== true) return <Navigate to={tenantPath("orders")} replace />;
  return <div className="min-w-0 space-y-8">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-3"><BookOpen className="h-6 w-6 text-primary" />My Bookshelf</h1><p className="text-sm text-muted-foreground mt-1">{shelf.data?.length ?? 0} saved products · {categories.length} {categories.length === 1 ? "category" : "categories"}</p></div>
      <Button onClick={() => navigate(tenantPath("orders/new"))}><Plus className="mr-2 h-4 w-4" />New product</Button>
    </header>
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row">
      <div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search bookshelf" placeholder="Search by name or SKU" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-full sm:w-56" aria-label="Bookshelf category"><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map(group => <SelectItem key={group.name} value={group.name}>{group.name}</SelectItem>)}</SelectContent></Select>
    </div>
    {shelf.isLoading ? <div className="space-y-8">{[1, 2].map(i => <Skeleton key={i} className="h-72 w-full" />)}</div> : shelf.isError ? <div className="space-y-3"><p className="text-destructive">Could not load your saved products.</p><Button variant="outline" onClick={() => shelf.refetch()}>Retry</Button></div> : groups.length === 0 ? <div className="py-16 text-center border-y border-border"><BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" /><h2 className="font-semibold text-lg">{search || category !== "all" ? "No matching products" : "Your bookshelf is empty"}</h2>{!search && category === "all" && <Button className="mt-5" variant="outline" onClick={() => navigate(tenantPath("orders/new"))}><Plus className="mr-2 h-4 w-4" />New product</Button>}</div> : <div className="space-y-10">{groups.map(group => <BookshelfRow key={group.name} name={group.name} items={group.products} onSelect={setSelected} onRenameShelf={() => { setShelfEdit({ from: group.name, items: group.products }); setShelfRename(group.name); }} onDeleteShelf={() => { setShelfDelete({ from: group.name, items: group.products }); setShelfTarget(categories.find(c => c.name !== group.name)?.name ?? ""); }} />)}</div>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !shelf.operation.isPending) setSelected(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
      {selected && <><DialogHeader><p className="pr-6 text-xs text-muted-foreground">{selected.snapshot.product_name}</p><DialogTitle className="break-words pr-6">{selected.name}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-6 sm:flex-row"><div className="flex shrink-0 justify-center py-2"><BookshelfCover item={selected} /></div><div className="min-w-0 flex-1 space-y-5">
          <div className="space-y-2 text-sm text-muted-foreground">{selected.sku && <p className="break-all">{selected.sku}</p>}<p>{selected.snapshot.spec.page_count} pages · Revision {selected.revision}</p><p className="break-words">{Object.entries(selected.snapshot.spec.selected_options ?? {}).filter(([key]) => /Binding|Size|Paper/i.test(key)).map(([, value]) => value).join(" · ")}</p><p className="text-xs">Updated {format(new Date(selected.updated_at), "dd MMM yyyy")}</p></div>
          <div className="space-y-2"><Label htmlFor={`copies-${selected.id}`}>Copies</Label><Input id={`copies-${selected.id}`} type="number" min={1} step={1} value={quantities[selected.id] ?? String(selected.snapshot.spec.quantity || 1)} onChange={e => setQuantities(prev => ({ ...prev, [selected.id]: e.target.value }))} /></div>
          <Button className="w-full" disabled={shelf.operation.isPending} onClick={() => restore(selected, false)}>{busyId === selected.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}Order copies</Button>
        </div></div>
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3"><div className="min-w-0 flex-1 space-y-1"><Label htmlFor="move-shelf">Move to shelf</Label><Input id="move-shelf" list="move-shelf-list" maxLength={80} placeholder={`Currently: ${selected.snapshot.shelf_category || selected.snapshot.product_name || ""}`} value={moveTo} onChange={e => setMoveTo(e.target.value)} /><datalist id="move-shelf-list">{bookshelfCategoryNames(shelf.data ?? []).map(n => <option key={n} value={n} />)}</datalist></div><Button variant="outline" disabled={!moveTo.trim() || shelf.operation.isPending} onClick={async () => { await moveItem(selected, moveTo); setMoveTo(""); }}>Move</Button></div>
        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-3"><Button className="mr-auto" variant="ghost" size="sm" disabled={shelf.operation.isPending} onClick={() => restore(selected, true)}><RefreshCw className="mr-2 h-3.5 w-3.5" />Update artwork</Button><Button variant="ghost" size="icon" aria-label={`Rename ${selected.name}`} title="Rename product" disabled={shelf.operation.isPending} onClick={() => { setEditing(selected); setName(selected.name); setSku(selected.sku ?? ""); setShelfName(selected.snapshot.shelf_category || selected.snapshot.product_name || ""); setSelected(null); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Remove ${selected.name}`} title="Remove from bookshelf" disabled={shelf.operation.isPending} onClick={async () => {
          if (!window.confirm(`Remove "${selected.name}" from your bookshelf? Existing orders will not change.`)) return;
          try { await shelf.operation.mutateAsync({ operation: "archive", id: selected.id }); setSelected(null); toast.success("Product removed from bookshelf"); } catch { /* reported */ }
        }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
      </>}
    </DialogContent></Dialog>
    <Dialog open={!!shelfDelete} onOpenChange={open => { if (!open && !shelfBusy) setShelfDelete(null); }}><DialogContent className="sm:max-w-md" aria-describedby={undefined}><DialogHeader><DialogTitle>Delete “{shelfDelete?.from}” shelf</DialogTitle></DialogHeader><div className="space-y-2"><p className="text-sm text-muted-foreground">Its {shelfDelete?.items.length} {shelfDelete?.items.length === 1 ? "product" : "products"} won't be deleted — choose a shelf to move them to.</p><Label htmlFor="shelf-target">Move products to</Label><Input id="shelf-target" list="shelf-target-list" maxLength={80} placeholder="Pick a shelf or type a new one" value={shelfTarget} onChange={e => setShelfTarget(e.target.value)} /><datalist id="shelf-target-list">{bookshelfCategoryNames(shelf.data ?? []).filter(n => n !== shelfDelete?.from).map(n => <option key={n} value={n} />)}</datalist></div><DialogFooter><Button variant="outline" disabled={shelfBusy} onClick={() => setShelfDelete(null)}>Cancel</Button><Button variant="destructive" disabled={!shelfTarget.trim() || shelfTarget.trim() === shelfDelete?.from || shelfBusy} onClick={deleteShelf}>{shelfBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete shelf</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !shelf.operation.isPending) setEditing(null); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Edit product details</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="rename-product">Product name</Label><Input id="rename-product" maxLength={160} value={name} onChange={e => setName(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="rename-category">Shelf / category</Label><Input id="rename-category" list="rename-category-list" maxLength={80} placeholder="Pick a shelf or type a new one" value={shelfName} onChange={e => setShelfName(e.target.value)} /><datalist id="rename-category-list">{bookshelfCategoryNames(shelf.data ?? []).map(n => <option key={n} value={n} />)}</datalist></div><div className="space-y-2"><Label htmlFor="rename-sku">SKU / reference</Label><Input id="rename-sku" maxLength={80} value={sku} onChange={e => setSku(e.target.value)} /></div></div><DialogFooter><Button variant="outline" disabled={shelf.operation.isPending} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={!name.trim() || shelf.operation.isPending} onClick={async () => { if (!editing) return; try { await shelf.operation.mutateAsync({ operation: "rename", id: editing.id, name: name.trim(), sku: sku.trim(), category: shelfName.trim() }); setEditing(null); } catch { /* reported */ } }}>Save changes</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!shelfEdit} onOpenChange={open => { if (!open && !shelfBusy) setShelfEdit(null); }}><DialogContent className="sm:max-w-md" aria-describedby={undefined}><DialogHeader><DialogTitle>Rename shelf</DialogTitle></DialogHeader><div className="space-y-2"><Label htmlFor="shelf-rename">Shelf name</Label><Input id="shelf-rename" maxLength={80} value={shelfRename} onChange={e => setShelfRename(e.target.value)} /><p className="text-xs text-muted-foreground">Pick an existing shelf name to merge them.</p></div><DialogFooter><Button variant="outline" disabled={shelfBusy} onClick={() => setShelfEdit(null)}>Cancel</Button><Button disabled={!shelfRename.trim() || shelfBusy} onClick={renameShelf}>{shelfBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}