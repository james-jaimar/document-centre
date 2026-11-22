import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BookOpen, Plus, Search, Pencil, Trash2, FileText, Loader2, ShoppingCart, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useBookshelf, type BookshelfItem } from "@/hooks/useBookshelf";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

function ShelfCover({ item }: { item: BookshelfItem }) {
  const raw = item.snapshot.documents?.flatMap(d => d.thumbnail_urls ?? []).find(path => typeof path === "string" && path.length > 0) ?? null;
  const url = useSignedThumbnailUrl(raw);
  const [failed, setFailed] = useState(false);
  return <div className="aspect-[4/3] w-full bg-muted/40 border-b border-border flex items-center justify-center p-5 overflow-hidden">
    {url && !failed ? <img src={url} alt={`${item.name} cover`} className="h-full max-w-full object-contain" onError={() => setFailed(true)} /> : <FileText className="h-16 w-16 text-muted-foreground/40" />}
  </div>;
}

export default function CustomerBookshelf() {
  const shelf = useBookshelf();
  const { tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BookshelfItem | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const items = (shelf.data ?? []).filter(item => `${item.name} ${item.sku ?? ""} ${item.snapshot.product_name}`.toLowerCase().includes(search.toLowerCase()));
  const restore = async (item: BookshelfItem, revise: boolean) => {
    const quantity = Number(quantities[item.id] ?? item.snapshot.spec.quantity ?? 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1) { toast.error("Enter a whole number of copies greater than zero"); return; }
    setBusyId(item.id);
    try {
      const result = await shelf.operation.mutateAsync({ operation: "restore", id: item.id, quantity });
      if (!result.order_id) throw new Error("Could not open your product");
      navigate(tenantPath(`orders/${result.order_id}/${revise ? "files" : "build"}`));
    } catch { /* operation reports its error */ } finally { setBusyId(null); }
  };
  if (shelf.feature.isLoading) return <Skeleton className="h-40 w-full" />;
  if (shelf.feature.isError) return <div className="space-y-3"><p className="text-destructive">Could not load your bookshelf.</p><Button variant="outline" onClick={() => shelf.feature.refetch()}>Retry</Button></div>;
  if (shelf.feature.data !== true) return <Navigate to={tenantPath("orders")} replace />;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-3"><BookOpen className="h-6 w-6 text-primary" />My Bookshelf</h1><p className="text-sm text-muted-foreground mt-1">{shelf.data?.length ?? 0} saved products</p></div>
      <Button onClick={() => navigate(tenantPath("orders/new"))}><Plus className="mr-2 h-4 w-4" />New product</Button>
    </header>
    <div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search bookshelf" placeholder="Search by name or SKU" value={search} onChange={e => setSearch(e.target.value)} /></div>
    {shelf.isLoading ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-80" />)}</div> : shelf.isError ? <div className="space-y-3"><p className="text-destructive">Could not load your saved products.</p><Button variant="outline" onClick={() => shelf.refetch()}>Retry</Button></div> : items.length === 0 ? <div className="py-16 text-center border-y border-border"><BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" /><h2 className="font-semibold text-lg">{search ? "No matching products" : "Your bookshelf is empty"}</h2></div> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(item => <article key={item.id} className="rounded-lg border border-border bg-card overflow-hidden min-w-0">
        <ShelfCover item={item} />
        <div className="p-4 space-y-4">
          <div><p className="text-xs text-muted-foreground mb-1">{item.snapshot.product_name}</p><h2 className="font-semibold break-words">{item.name}</h2>{item.sku && <p className="text-xs text-muted-foreground mt-1 break-all">{item.sku}</p>}</div>
          <div className="text-xs text-muted-foreground space-y-1"><p>{item.snapshot.spec.page_count} pages · Revision {item.revision}</p><p className="break-words">{Object.entries(item.snapshot.spec.selected_options ?? {}).filter(([key]) => /Binding|Size|Paper/i.test(key)).map(([, value]) => value).join(" · ")}</p><p>Updated {format(new Date(item.updated_at), "dd MMM yyyy")}</p></div>
          <div className="flex items-end gap-2"><div className="space-y-1 flex-1 min-w-0"><Label htmlFor={`copies-${item.id}`} className="text-xs">Copies</Label><Input id={`copies-${item.id}`} type="number" min={1} step={1} value={quantities[item.id] ?? String(item.snapshot.spec.quantity || 1)} onChange={e => setQuantities(prev => ({ ...prev, [item.id]: e.target.value }))} /></div><Button disabled={shelf.operation.isPending} onClick={() => restore(item, false)}>{busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}Review & order</Button></div>
          <div className="flex items-center gap-1 border-t border-border pt-3"><Button className="mr-auto" variant="ghost" size="sm" disabled={shelf.operation.isPending} onClick={() => restore(item, true)}><RefreshCw className="mr-2 h-3.5 w-3.5" />Update artwork</Button><Button variant="ghost" size="icon" aria-label={`Rename ${item.name}`} title="Rename product" disabled={shelf.operation.isPending} onClick={() => { setEditing(item); setName(item.name); setSku(item.sku ?? ""); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Remove ${item.name}`} title="Remove from bookshelf" disabled={shelf.operation.isPending} onClick={async () => {
            if (!window.confirm(`Remove "${item.name}" from your bookshelf? Existing orders will not change.`)) return;
            try { await shelf.operation.mutateAsync({ operation: "archive", id: item.id }); toast.success("Product removed from bookshelf"); } catch { /* reported */ }
          }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
        </div>
      </article>)}
    </div>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !shelf.operation.isPending) setEditing(null); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Rename product</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="rename-product">Product name</Label><Input id="rename-product" maxLength={160} value={name} onChange={e => setName(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="rename-sku">SKU / reference</Label><Input id="rename-sku" maxLength={80} value={sku} onChange={e => setSku(e.target.value)} /></div></div><DialogFooter><Button variant="outline" disabled={shelf.operation.isPending} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={!name.trim() || shelf.operation.isPending} onClick={async () => { if (!editing) return; try { await shelf.operation.mutateAsync({ operation: "rename", id: editing.id, name: name.trim(), sku: sku.trim() }); setEditing(null); } catch { /* reported */ } }}>Save changes</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}