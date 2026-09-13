import { Link, useNavigate } from "react-router-dom";
import { useSamplePack } from "@/hooks/useSamplePack";
import { useStorefrontCatalogue } from "@/hooks/useStorefrontCatalogue";
import { useStorefrontPrice } from "@/hooks/useStorefrontPrice";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { startOrderPath } from "@/lib/storefront/catalogue";
import { familyImage } from "@/lib/storefront/productImages";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, PackageOpen } from "lucide-react";

/**
 * Guided build of a fixed-price sample pack: one item of every included
 * product, personalised by the customer, delivered for a single flat fee.
 */
export default function SamplePack() {
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const { config, eligible, alreadyTaken, doneFamilyIds, complete, isLoading } = useSamplePack();
  const { entries, isLoading: catalogueLoading } = useStorefrontCatalogue();
  const { format } = useStorefrontPrice();

  if (isLoading || catalogueLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!config.enabled) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Sample packs aren't available</h1>
        <p className="mt-2 text-muted-foreground">
          This offer isn't running at the moment. Have a look around the shop instead.
        </p>
        <Button className="mt-6" asChild>
          <Link to={tenantPath("shop")}>Browse products</Link>
        </Button>
      </div>
    );
  }

  const included = config.familyIds
    .map((id) => entries.find((e) => e.family.id === id))
    .filter(Boolean) as typeof entries;

  const doneCount = included.filter((e) => doneFamilyIds.includes(e.family.id)).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <PackageOpen className="text-primary" size={28} />
          <h1 className="text-2xl font-semibold text-foreground">{config.headline}</h1>
        </div>
        <p className="max-w-2xl text-muted-foreground">{config.blurb}</p>
        <p className="text-lg font-semibold text-foreground">
          {format(config.price)} for the whole pack, delivery included.
        </p>
      </header>

      {alreadyTaken && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Your business has already had its sample pack. Talk to us if you'd like another one.
        </div>
      )}

      {!eligible && !alreadyTaken && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Sample packs are for trade accounts. Sign in with your trade login, or get in touch to
          open an account.
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-foreground">
          {doneCount} of {included.length} personalised
        </p>
        <Button disabled={!complete} onClick={() => navigate(tenantPath("cart"))}>
          {complete ? "Go to basket" : "Finish every item to continue"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {included.map((entry) => {
          const done = doneFamilyIds.includes(entry.family.id);
          const href = `${tenantPath(startOrderPath(entry.family))}${
            startOrderPath(entry.family).includes("?") ? "&" : "?"
          }sample=1`;
          return (
            <Card key={entry.family.id} className={done ? "border-primary" : undefined}>
              <CardContent className="space-y-3 p-4">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-muted">
                  <img
                    src={familyImage(entry.family)}
                    alt={entry.family.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-foreground">{entry.family.name}</p>
                  {done && (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      <Check size={14} /> Done
                    </span>
                  )}
                </div>
                <Button
                  variant={done ? "outline" : "default"}
                  className="w-full"
                  disabled={!eligible}
                  asChild={eligible}
                >
                  {eligible ? (
                    <Link to={href}>{done ? "Change artwork" : "Personalise"}</Link>
                  ) : (
                    <span>Personalise</span>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
