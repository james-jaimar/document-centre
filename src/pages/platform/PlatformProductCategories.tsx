import { useState } from "react";
import {
  useProductCategories,
  useSaveProductCategory,
  useDeleteProductCategory,
  useReorderProductCategory,
  type ProductCategory,
} from "@/hooks/useProductCategories";
import { useProductFamilies, useUpdateProductFamily } from "@/hooks/useProductFamilies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, FolderTree, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const slugify = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const EMPTY = {
  name: "",
  slug: "",
  description: "",
  image_url: "",
  is_active: true,
  sort_order: 0,
};

export default function PlatformProductCategories() {
  const { data: categories, isLoading } = useProductCategories();
  const { data: families } = useProductFamilies(null, { masterOnly: true });
  const save = useSaveProductCategory();
  const remove = useDeleteProductCategory();
  const reorder = useReorderProductCategory();
  const updateFamily = useUpdateProductFamily();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<typeof EMPTY & { id?: string }>(EMPTY);

  const startNew = () => {
    setDraft({ ...EMPTY, sort_order: (categories?.length ?? 0) * 10 });
    setOpen(true);
  };
  const startEdit = (c: ProductCategory) => {
    setDraft({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? "",
      image_url: c.image_url ?? "",
      is_active: c.is_active,
      sort_order: c.sort_order,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!draft.name.trim()) return toast.error("Name is required");
    try {
      await save.mutateAsync({
        ...draft,
        slug: draft.slug.trim() || slugify(draft.name),
        description: draft.description || null,
        image_url: draft.image_url || null,
      });
      toast.success("Category saved");
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save category");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const list = [...(categories ?? [])];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    await reorder.mutateAsync(list.map((c, i) => ({ id: c.id, sort_order: i * 10 })));
  };

  const assign = async (familyId: string, categoryId: string) => {
    try {
      await updateFamily.mutateAsync({
        id: familyId,
        category_id: categoryId === "none" ? null : categoryId,
      } as any);
      toast.success("Product updated");
    } catch (e: any) {
      toast.error(e.message ?? "Could not update product");
    }
  };

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FolderTree className="h-6 w-6" aria-hidden />
            Product Categories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Groups shown on tenant storefronts. A category only appears when a store has visible
            products in it.
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus className="mr-1.5 h-4 w-4" /> New category
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Category</th>
                <th className="px-4 py-2.5 text-left font-medium">Products</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(categories ?? []).map((c, i) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">/{c.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(families ?? []).filter((f: any) => f.category_id === c.id).length}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={c.is_active ? "default" : "secondary"}>
                      {c.is_active ? "Active" : "Hidden"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move up"
                        onClick={() => move(i, -1)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move down"
                        onClick={() => move(i, 1)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => startEdit(c)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={() => {
                          if (confirm(`Delete “${c.name}”? Products stay, but lose this category.`))
                            remove.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!categories?.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Assign products</h2>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <tbody>
              {(families ?? []).map((f: any) => (
                <tr key={f.id} className="border-t first:border-t-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-foreground">{f.name}</p>
                    <p className="text-xs text-muted-foreground">/{f.slug}</p>
                  </td>
                  <td className="w-72 px-4 py-2.5">
                    <Select
                      value={f.category_id ?? "none"}
                      onValueChange={(v) => assign(f.id, v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Uncategorised" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Uncategorised</SelectItem>
                        {(categories ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    name: e.target.value,
                    slug: d.id ? d.slug : slugify(e.target.value),
                  }))
                }
                placeholder="e.g. Deskpads"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Slug</Label>
              <Input
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                placeholder="deskpads"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category image</Label>
              <HeroImageUpload
                value={draft.image_url}
                onChange={(v) => setDraft((d) => ({ ...d, image_url: v }))}
                slug={draft.slug || slugify(draft.name) || "category"}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Active</Label>
              <Switch
                checked={draft.is_active}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
