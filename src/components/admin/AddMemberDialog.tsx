import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranches } from "@/hooks/useBranches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Loader2, CheckCircle2, Mail, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface RoleOption {
  value: string;
  label: string;
  description: string;
  branchScoped?: boolean;
  tenantWide?: boolean;
}

const ROLE_OPTIONS: RoleOption[] = [
  { value: "owner", label: "Owner", description: "Full control, including billing", tenantWide: true },
  { value: "admin", label: "Tenant Admin", description: "Manage all tenant settings and users", tenantWide: true },
  { value: "sales", label: "Sales", description: "Quotes, customers, orders" },
  { value: "production", label: "Production", description: "Production queue and jobs" },
  { value: "accounts", label: "Accounts", description: "Invoices and payments" },
  { value: "branch_manager", label: "Branch Manager", description: "Manage one branch and its staff", branchScoped: true },
  { value: "store_operator", label: "Store Operator", description: "Day-to-day operations for one branch", branchScoped: true },
];

const BRANCH_REQUIRED = new Set(["branch_manager", "store_operator"]);
const TENANT_WIDE = new Set(["owner", "admin"]);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  appId: string;
}

type LookupState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "existing"; name: string }
  | { status: "new" }
  | { status: "invalid" };

export function AddMemberDialog({ open, onOpenChange, tenantId, appId }: Props) {
  const { data: branches } = useBranches(tenantId);
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const [role, setRole] = useState("admin");
  const [branchId, setBranchId] = useState("");
  const [canViewAllOrders, setCanViewAllOrders] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setJobTitle("");
    setRole("admin"); setBranchId(""); setCanViewAllOrders(false); setSendEmail(true);
    setLookup({ status: "idle" }); setSubmitting(false); setFormError(null);
  };

  // Live email lookup (debounced)
  useEffect(() => {
    const trimmed = email.trim();
    if (!trimmed) { setLookup({ status: "idle" }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setLookup({ status: "invalid" }); return;
    }
    setLookup({ status: "checking" });
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name")
        .ilike("email", trimmed)
        .limit(1)
        .maybeSingle();
      if (data) {
        const name = [data.first_name, data.last_name].filter(Boolean).join(" ") ||
          data.display_name || trimmed;
        setLookup({ status: "existing", name });
        // Pre-fill names if blank
        if (!firstName && data.first_name) setFirstName(data.first_name);
        if (!lastName && data.last_name) setLastName(data.last_name);
      } else {
        setLookup({ status: "new" });
      }
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const branchRequired = BRANCH_REQUIRED.has(role);
  const tenantWide = TENANT_WIDE.has(role);
  const showCanViewAll = !tenantWide && !branchRequired;

  const validation = useMemo(() => {
    if (!firstName.trim()) return "First name is required";
    if (!lastName.trim()) return "Last name is required";
    if (!email.trim()) return "Email is required";
    if (lookup.status === "invalid") return "Please enter a valid email address";
    if (branchRequired && !branchId) return "A branch must be selected for this role";
    return null;
  }, [firstName, lastName, email, lookup.status, branchRequired, branchId]);

  const handleSubmit = async () => {
    if (validation) { setFormError(validation); return; }
    setFormError(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-member", {
        body: {
          email: email.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          job_title: jobTitle.trim() || null,
          tenant_id: tenantId,
          app_id: appId,
          role,
          branch_id: tenantWide ? null : (branchId || null),
          can_view_all_orders: showCanViewAll ? canViewAllOrders : false,
          send_email: sendEmail,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        data?.invited
          ? (data?.email_sent ? "Invitation sent" : "Member created")
          : "Member added"
      );
      queryClient.invalidateQueries({ queryKey: ["tenant-members"] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.message || "Failed to add member";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = submitting
    ? "Saving…"
    : lookup.status === "new"
      ? (sendEmail ? "Send Invitation" : "Create Member")
      : "Add Member";

  const selectedRole = ROLE_OPTIONS.find((r) => r.value === role);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} /> Add Team Member
          </DialogTitle>
          <DialogDescription>
            Add a new staff member to this tenant. They'll receive an email to set their password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Identity */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Identity</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="firstName">First name *</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="lastName">Last name *</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
              {lookup.status === "checking" && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Checking…
                </p>
              )}
              {lookup.status === "existing" && (
                <p className="text-xs text-primary mt-1 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Existing account ({lookup.name}) — will be added to your tenant.
                </p>
              )}
              {lookup.status === "new" && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Mail size={12} /> New account — invitation will be emailed.
                </p>
              )}
              {lookup.status === "invalid" && (
                <p className="text-xs text-destructive mt-1">Invalid email format.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" placeholder="Optional" />
              </div>
              <div>
                <Label htmlFor="jobTitle">Job title</Label>
                <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1" placeholder="Optional" />
              </div>
            </div>
          </section>

          {/* Role & access */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Role &amp; access</h3>

            <div>
              <Label>Role *</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRole && (
                <p className="text-xs text-muted-foreground mt-1">{selectedRole.description}</p>
              )}
            </div>

            {!tenantWide && (
              <div>
                <Label>
                  Branch {branchRequired && <span className="text-destructive">*</span>}
                </Label>
                <Select value={branchId || "__all__"} onValueChange={(v) => setBranchId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={branchRequired ? "Select a branch" : "All branches"} />
                  </SelectTrigger>
                  <SelectContent>
                    {!branchRequired && <SelectItem value="__all__">All branches</SelectItem>}
                    {branches?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {branchRequired && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Branch staff only see orders for their assigned branch.
                  </p>
                )}
              </div>
            )}

            {showCanViewAll && (
              <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
                <Switch
                  id="canViewAll"
                  checked={canViewAllOrders}
                  onCheckedChange={setCanViewAllOrders}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label htmlFor="canViewAll" className="cursor-pointer">Can view all orders</Label>
                  <p className="text-xs text-muted-foreground">
                    Otherwise this user only sees orders they handle directly.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3">
              <Switch
                id="sendEmail"
                checked={sendEmail}
                onCheckedChange={setSendEmail}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="sendEmail" className="cursor-pointer">Send welcome email</Label>
                <p className="text-xs text-muted-foreground">
                  Off lets you add the member silently and share credentials manually.
                </p>
              </div>
            </div>
          </section>

          {formError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !!validation}>
            {submitting && <Loader2 size={14} className="mr-2 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
