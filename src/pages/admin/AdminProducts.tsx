import { useState } from "react";
import {
  useProductFamilies,
  useCreateProductFamily,
  useUpdateProductFamily,
  useDeleteProductFamily,
} from "@/hooks/useProductFamilies";
import type { ProductFamily } from "@/hooks/useProductFamilies";
import ProductFamilyForm from "@/components/admin/ProductFamilyForm";
import ProductOptionsEditor from "@/components/admin/ProductOptionsEditor";
import ProductPricingTab from "@/components/admin/ProductPricingTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, ChevronDown, Sparkles, ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { seedBoundDocument } from "@/lib/seedBoundDocument";
import { seedAllProducts } from "@/lib/seedAllProducts";

const AdminProducts = () => {
  // Master catalogue editor (platform admin). Always operates on tenant_id IS NULL.
  const { data: families = [], isLoading } = useProductFamilies(null, { masterOnly: true });
  const createFamily = useCreateProductFamily();
  const updateFamily = useUpdateProductFamily();
  const deleteFamily = useDeleteProductFamily();

  const [formOpen, setFormOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState<ProductFamily | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedingAll, setSeedingAll] = useState(false);

  function handleCreate() {
    setEditingFamily(null);
    setFormOpen(true);
  }

  function handleEdit(family: ProductFamily) {
    setEditingFamily(family);
    setFormOpen(true);
  }

  async function handleFormSubmit(values: any) {
    try {
      if (editingFamily) {
        await updateFamily.mutateAsync({ id: editingFamily.id, ...values });
        toast({ title: "Product family updated" });
      } else {
        await createFamily.mutateAsync(values);
        toast({ title: "Product family created" });
      }
      setFormOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteFamily.mutateAsync(deleteId);
      toast({ title: "Product family deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeleteId(null);
  }

  async function handleSeedBoundDocument() {
    setSeeding(true);
    try {
      const result = await seedBoundDocument();
      toast({
        title: "Bound Documents seeded",
        description: `Created with ${result.optionCount} options and ${result.ruleCount} pricing rules.`,
      });
      // Refetch
      window.location.reload();
    } catch (e: any) {
      toast({ title: "Seed failed", description: e.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  }

  async function handleSeedAllProducts() {
    setSeedingAll(true);
    try {
      const result = await seedAllProducts();
      if (result.seeded.length === 0) {
        toast({ title: "All products already exist", description: `Skipped: ${result.skipped.join(", ")}` });
      } else {
        toast({
          title: "Products seeded",
          description: `Created ${result.seeded.length} families (${result.totalOptions} options, ${result.totalRules} rules). Skipped: ${result.skipped.length}`,
        });
        window.location.reload();
      }
    } catch (e: any) {
      toast({ title: "Seed failed", description: e.message, variant: "destructive" });
    } finally {
      setSeedingAll(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Families</h1>
          <p className="text-sm text-muted-foreground">Manage product types and their configurable options.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/binding-artwork-audit">
              <ImageIcon className="h-4 w-4 mr-2" />
              Binding Artwork Audit
            </Link>
          </Button>
          <Button variant="outline" onClick={handleSeedAllProducts} disabled={seedingAll || seeding}>
            <Sparkles className="h-4 w-4 mr-2" />
            {seedingAll ? "Seeding All…" : "Seed All Products"}
          </Button>
          <Button variant="outline" onClick={handleSeedBoundDocument} disabled={seeding || seedingAll}>
            <Sparkles className="h-4 w-4 mr-2" />
            {seeding ? "Seeding…" : "Seed Bound Document"}
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Product Family
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : families.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No product families yet. Create your first one or seed the Bound Document template.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Icon</TableHead>
                <TableHead>Options</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {families.map((f) => {
                const optionCount = f.product_options?.[0]?.count ?? 0;
                return (
                  <Collapsible key={f.id} asChild open={expandedId === f.id} onOpenChange={(open) => setExpandedId(open ? f.id : null)}>
                    <>
                      <TableRow className="group">
                        <TableCell>{f.sort_order}</TableCell>
                        <TableCell className="font-medium">
                          <CollapsibleTrigger asChild>
                            <button className="flex items-center gap-1 hover:text-primary transition-colors">
                              {f.name}
                              <ChevronDown className={`h-3 w-3 transition-transform ${expandedId === f.id ? "rotate-180" : ""}`} />
                            </button>
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{f.slug}</TableCell>
                        <TableCell><Badge variant="outline">{f.icon || "—"}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="secondary">{optionCount} option{optionCount !== 1 ? "s" : ""}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={f.is_active ? "default" : "secondary"}>
                            {f.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(f)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteId(f.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <tr>
                          <td colSpan={7} className="bg-muted/30 p-4">
                            <Tabs defaultValue="options" className="w-full">
                              <TabsList className="mb-3">
                                <TabsTrigger value="options">Options</TabsTrigger>
                                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                              </TabsList>
                              <TabsContent value="options">
                                <ProductOptionsEditor productFamilyId={f.id} />
                              </TabsContent>
                              <TabsContent value="pricing">
                                <ProductPricingTab productFamilyId={f.id} productFamilyName={f.name} />
                              </TabsContent>
                            </Tabs>
                          </td>
                        </tr>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ProductFamilyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        family={editingFamily}
        onSubmit={handleFormSubmit}
        isPending={createFamily.isPending || updateFamily.isPending}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product Family?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this product family and all its options. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminProducts;
