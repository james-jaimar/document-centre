import { useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranches, useCreateBranch, useUpdateBranch, useDeleteBranch, type Branch } from "@/hooks/useBranches";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Building2, MapPin, Phone, Mail, Plus, Pencil, Trash2, ChevronRight, LayoutGrid, List, Copy, Globe } from "lucide-react";
import { buildAdminPath } from "@/lib/adminRouting";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";

interface BranchFormData {
  name: string;
  code: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  email: string;
  phone: string;
  is_active: boolean;
  is_live: boolean;
  url_slug: string;
}

const emptyForm: BranchFormData = {
  name: "", code: "", address: "", city: "", province: "",
  postal_code: "", country: "ZA", email: "", phone: "", is_active: true,
  is_live: false, url_slug: "",
};

const AdminBranches = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenantContext();
  const { data: branches, isLoading } = useBranches(tenantId);
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const deleteBranch = useDeleteBranch();

  const [editing, setEditing] = useState<Branch | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<BranchFormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("branch-view") as "grid" | "list") || "grid";
  });

  const toggleView = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("branch-view", mode);
  };

  const openNew = () => {
    setEditing(null);
    setIsNew(true);
    setForm(emptyForm);
  };

  const openEdit = (b: Branch) => {
    setEditing(b);
    setIsNew(false);
    setForm({
      name: b.name,
      code: b.code || "",
      address: b.address || "",
      city: b.city || "",
      province: b.province || "",
      postal_code: b.postal_code || "",
      country: b.country,
      email: b.email || "",
      phone: b.phone || "",
      is_active: b.is_active,
      is_live: b.is_live,
      url_slug: b.url_slug || "",
    });
  };

  const handleSave = async () => {
    if (!tenantId) return;
    try {
      if (isNew) {
        const slugVal = (form.code || form.name)
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
        await createBranch.mutateAsync({
          ...form,
          tenant_id: tenantId,
          address: form.address || null,
          city: form.city || null,
          province: form.province || null,
          postal_code: form.postal_code || null,
          email: form.email || null,
          phone: form.phone || null,
          code: form.code || null,
          slug: slugVal,
          url_slug: form.url_slug.trim() || null,
        });
        toast.success("Branch created");
      } else if (editing) {
        await updateBranch.mutateAsync({
          id: editing.id,
          ...form,
          address: form.address || null,
          city: form.city || null,
          province: form.province || null,
          postal_code: form.postal_code || null,
          email: form.email || null,
          phone: form.phone || null,
          code: form.code || null,
          url_slug: form.url_slug.trim() || null,
        });
        toast.success("Branch updated");
      }
      setEditing(null);
      setIsNew(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBranch.mutateAsync(deleteTarget.id);
      toast.success("Branch deleted");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const set = (field: keyof BranchFormData, value: any) =>
    setForm((f) => ({ ...f, [field]: value }));

  const dialogOpen = isNew || !!editing;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Branch Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage branches for your organisation
            {branches?.length ? ` · ${branches.length} branch${branches.length !== 1 ? "es" : ""}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => toggleView("grid")}
            >
              <LayoutGrid size={16} />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => toggleView("list")}
            >
              <List size={16} />
            </Button>
          </div>
          <Button onClick={openNew}>
            <Plus size={16} className="mr-2" /> Add Branch
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading branches…</div>
      ) : !branches?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No branches yet. Click "Add Branch" to create one.
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{b.name}</CardTitle>
                      {b.code && <p className="text-xs text-muted-foreground">Code: {b.code}</p>}
                    </div>
                  </div>
                  <Badge variant={b.is_active ? "default" : "secondary"}>
                    {b.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-sm text-muted-foreground">
                {(b.address || b.city) && (
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="mt-0.5 shrink-0" />
                    <span>{[b.address, b.city, b.province, b.postal_code].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {b.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="shrink-0" />
                    <span>{b.phone}</span>
                  </div>
                )}
                {b.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="shrink-0" />
                    <span>{b.email}</span>
                  </div>
                )}
                <div className="flex justify-end gap-1 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => navigate(buildAdminPath(`/admin/branches/${b.id}`, tenantId))}>
                    <ChevronRight size={14} className="mr-1" /> Manage
                  </Button>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(b); }}>
                    <Pencil size={14} className="mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(b); }}>
                    <Trash2 size={14} className="mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground">{b.code || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{b.city || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{b.province || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{b.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{b.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={b.is_active ? "default" : "secondary"}>
                        {b.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => navigate(buildAdminPath(`/admin/branches/${b.id}`, tenantId))}>
                          <ChevronRight size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(b)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={() => { setEditing(null); setIsNew(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? "New Branch" : "Edit Branch"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Branch Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. CPT-01" />
            </div>
            <div>
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>Province</Label>
              <Input value={form.province} onChange={(e) => set("province", e.target.value)} />
            </div>
            <div>
              <Label>Postal Code</Label>
              <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setIsNew(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || createBranch.isPending || updateBranch.isPending}>
              {createBranch.isPending || updateBranch.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This cannot be undone.
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

export default AdminBranches;
