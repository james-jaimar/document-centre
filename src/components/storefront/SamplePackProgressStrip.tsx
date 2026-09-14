import { Link } from "react-router-dom";
import { PackageOpen } from "lucide-react";
import { useTenantSlug } from "@/hooks/useTenantSlug";

/**
 * Slim strip shown at the top of a design screen while the customer is
 * building their sample pack, so the way back to the pack is always visible.
 */
export default function SamplePackProgressStrip({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const { tenantPath } = useTenantSlug();
  if (total <= 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-accent/40 px-4 py-2 text-sm">
      <PackageOpen className="h-4 w-4 text-primary" />
      <span className="font-medium text-foreground">
        Sample pack — {done} of {total} done
      </span>
      <Link
        to={tenantPath("sample-pack")}
        className="ml-auto font-medium text-primary underline-offset-2 hover:underline"
      >
        Back to sample pack
      </Link>
    </div>
  );
}
