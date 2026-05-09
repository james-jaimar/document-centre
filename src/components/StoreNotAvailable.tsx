import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { useNavigate } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";

export default function StoreNotAvailable({ slug }: { slug: string }) {
  const { openPicker, branches } = useBranch();
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();

  const goToTenantHome = () => {
    // Navigate to bare tenant root (no branch slug). The picker will open if multi-branch.
    navigate(tenantPath(""));
    if (branches.length > 1) openPicker();
  };

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl mb-6"
        style={{ background: "hsl(var(--tenant-primary, var(--primary)) / 0.12)" }}
      >
        <Store className="h-8 w-8" style={{ color: "hsl(var(--tenant-primary, var(--primary)))" }} />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        This store isn't online yet
      </h1>
      <p className="text-muted-foreground max-w-md mb-6">
        We couldn't find a live store at <span className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">{slug}</span>.
        It may not be part of our online network yet, or the link might be incorrect.
      </p>
      <Button onClick={goToTenantHome}>
        {branches.length > 1 ? "Choose another store" : "Go to home"}
      </Button>
    </div>
  );
}
