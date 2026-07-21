/**
 * QuoteCustomerPicker
 *
 * Combobox for the spec-quote builder. Lets admin/branch pick an existing
 * customer by name or email (autocomplete) while still allowing free-text
 * entry of a brand-new customer. Delegates the data source to either
 * `useBranchCustomers` (branch context) or `useTenantCustomers` (admin
 * context) so scope isolation matches the rest of the portal.
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, User, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTenantCustomersForBranch } from "@/hooks/useTenantCustomersForBranch";
import { useTenantCustomers } from "@/hooks/useTenantCustomers";
import { AddCustomerDialog as BranchAddCustomerDialog } from "@/components/branch/AddCustomerDialog";
import { useQueryClient } from "@tanstack/react-query";

export interface QuoteCustomerValue {
  email: string;
  name: string;
  profileId: string | null;
}

interface Props {
  context: "branch" | "tenant";
  value: QuoteCustomerValue;
  onChange: (next: QuoteCustomerValue) => void;
}

interface Row {
  profile_id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

function fullName(r: Row): string {
  return (
    r.display_name?.trim() ||
    [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
    ""
  );
}

export default function QuoteCustomerPicker({ context, value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();

  const branchQ = useTenantCustomersForBranch();
  const tenantQ = useTenantCustomers();
  const source = context === "branch" ? branchQ : tenantQ;
  const rows = useMemo<Row[]>(() => (source.data as any[] | undefined) ?? [], [source.data]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div className="flex items-center justify-between">
          <Label>Customer *</Label>
          {context === "branch" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setAddOpen(true)}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Add customer
            </Button>
          )}
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal"
            >
              <span className="flex items-center gap-2 truncate">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {value.email
                    ? value.name
                      ? `${value.name} · ${value.email}`
                      : value.email
                    : "Search or enter a customer…"}
                </span>
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
            <Command
              filter={(val, search) => {
                if (!search) return 1;
                return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
              }}
            >
              <CommandInput placeholder="Search by name or email…" />
              <CommandList>
                <CommandEmpty>
                  {source.isLoading ? "Loading customers…" : "No matching customer."}
                </CommandEmpty>
                <CommandGroup heading="Existing customers">
                  {rows.map((r) => {
                    const label = `${fullName(r)} ${r.email ?? ""}`.trim();
                    return (
                      <CommandItem
                        key={r.profile_id}
                        value={label}
                        onSelect={() => {
                          onChange({
                            email: r.email ?? "",
                            name: fullName(r),
                            profileId: r.profile_id,
                          });
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value.profileId === r.profile_id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{fullName(r) || "(no name)"}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {r.email ?? "—"}
                          </span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground mt-1">
          Pick an existing customer or type a brand-new email below.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="qcp-email">Customer email *</Label>
          <Input
            id="qcp-email"
            type="email"
            value={value.email}
            onChange={(e) =>
              onChange({ ...value, email: e.target.value, profileId: null })
            }
            placeholder="customer@company.com"
          />
        </div>
        <div>
          <Label htmlFor="qcp-name">Customer name</Label>
          <Input
            id="qcp-name"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="Jane Smith / Acme Ltd"
          />
        </div>
      </div>

      {context === "branch" && (
        <BranchAddCustomerDialog
          open={addOpen}
          onOpenChange={(v) => {
            setAddOpen(v);
            if (!v) {
              queryClient.invalidateQueries({ queryKey: ["tenant-customers-for-branch"] });
              queryClient.invalidateQueries({ queryKey: ["branch-customers"] });
            }
          }}
        />
      )}
    </div>
  );
}
