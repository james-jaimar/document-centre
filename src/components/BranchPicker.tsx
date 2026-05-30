import { useState, useMemo } from "react";
import { Search, MapPin, Store } from "lucide-react";
import { useBranch, type Branch, branchUrlSlug } from "@/contexts/BranchContext";
import { Input } from "@/components/ui/input";
import { useNavigate, useLocation } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";

// Routes where the active branch is implied by the resource being viewed
// (orders/:id, quotes/:id, etc). The page itself sets the branch from the
// resource — suppress the picker so it doesn't block the screen.
const RESOURCE_BRANCH_ROUTE_RE =
  /\/(orders|quotes)\/[0-9a-f-]{8,}(\/|$)/i;

export default function BranchPicker() {
  const { branches, showPicker, selectBranch, closePicker, activeBranch } = useBranch();
  const { slug: tenantSlug, isSubdomain } = useTenantSlug();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");


  const handleSelect = (b: Branch) => {
    selectBranch(b);
    const seg = branchUrlSlug(b);
    const target = isSubdomain ? `/${seg}` : `/t/${tenantSlug}/${seg}`;
    navigate(target);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return branches;
    const q = search.toLowerCase();
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.city?.toLowerCase().includes(q) ||
        b.province?.toLowerCase().includes(q) ||
        b.slug.includes(q)
    );
  }, [branches, search]);

  if (!showPicker) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold text-foreground">
              Select your branch
            </h2>
            {activeBranch && (
              <button
                onClick={closePicker}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Choose a branch to view products and pricing for your area.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search branches..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
        </div>

        {/* Branch list */}
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No branches match &ldquo;{search}&rdquo;
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filtered.map((branch) => (
                <BranchCard
                  key={branch.id}
                  branch={branch}
                  isSelected={activeBranch?.id === branch.id}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground text-center">
          {branches.length} branches available
        </div>
      </div>
    </div>
  );
}

function BranchCard({
  branch,
  isSelected,
  onSelect,
}: {
  branch: Branch;
  isSelected: boolean;
  onSelect: (b: Branch) => void;
}) {
  const location = [branch.city, branch.province].filter(Boolean).join(", ");

  return (
    <button
      onClick={() => onSelect(branch)}
      className={`
        flex items-start gap-3 rounded-xl border p-4 text-left transition-all
        hover:border-primary/40 hover:bg-primary/5
        ${isSelected ? "border-primary bg-primary/10 ring-1 ring-primary/20" : "border-border bg-background"}
      `}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "hsl(var(--tenant-primary, var(--primary)) / 0.12)" }}
      >
        <Store
          className="h-5 w-5"
          style={{ color: "hsl(var(--tenant-primary, var(--primary)))" }}
        />
      </div>
      <div className="min-w-0">
        <div className="font-medium text-foreground text-sm truncate">
          {branch.name}
        </div>
        {location && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{location}</span>
          </div>
        )}
      </div>
    </button>
  );
}
