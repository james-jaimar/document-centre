import { Check, ChevronDown, Globe } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COUNTRY_LIST, getCountry, regionFlag } from "@/lib/countries";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { cn } from "@/lib/utils";

interface Props {
  countryCode: string | null | undefined;
  compact?: boolean; // mobile: flag-only chip
}

const GEO_TOAST_KEY = "dc_currency_geo_notice";

/**
 * Storefront country / currency indicator.
 *
 * When the tenant sells in a single currency this stays a passive flag chip.
 * When the tenant has opted into multi-currency it becomes a live switcher
 * listing the currencies they accept — selecting one re-prices the storefront.
 */
export default function CountryFlagBadge({ countryCode, compact = false }: Props) {
  const { region, regions, multiCurrency, detected, setRegion } = useRegionalPricing();
  const notified = useRef(false);

  // One-off nudge when geolocation picked the currency for the visitor.
  useEffect(() => {
    if (!multiCurrency || !detected || !region || notified.current) return;
    if (sessionStorage.getItem(GEO_TOAST_KEY)) return;
    notified.current = true;
    sessionStorage.setItem(GEO_TOAST_KEY, "1");
    toast.info(`Showing prices in ${region.currency_code}`, {
      description: "You can change the currency any time from the header.",
    });
  }, [multiCurrency, detected, region]);

  if (!multiCurrency) {
    const active = getCountry(countryCode);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Country: ${active.name}`}
            aria-label={`Country: ${active.name}`}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors shrink-0",
              compact && "px-2",
            )}
          >
            <span className="text-base leading-none" aria-hidden>
              {active.emoji}
            </span>
            {!compact && <span className="truncate max-w-[120px]">{active.name}</span>}
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Country</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {COUNTRY_LIST.map((c) => {
            const isActive = c.code === active.code;
            return (
              <DropdownMenuItem
                key={c.code}
                disabled={!c.available}
                onSelect={(e) => e.preventDefault()}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base leading-none" aria-hidden>{c.emoji}</span>
                  <span>{c.name}</span>
                </span>
                {isActive ? (
                  <Check className="h-3.5 w-3.5 opacity-70" />
                ) : !c.available ? (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Soon</span>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const activeFlag = region ? regionFlag(region.region_code, region.currency_code) : "🌍";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`Currency: ${region?.currency_code ?? ""}`}
          aria-label={`Change currency. Current currency ${region?.currency_code ?? "unknown"}`}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors shrink-0",
            compact && "px-2",
          )}
        >
          <span className="text-base leading-none" aria-hidden>{activeFlag}</span>
          <span className="font-semibold">{region?.currency_code ?? "—"}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5" /> Region &amp; currency
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {regions.map((r) => {
          const isActive = r.id === region?.id;
          return (
            <DropdownMenuItem
              key={r.id}
              onSelect={() => setRegion(r.region_code)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <span className="text-base leading-none" aria-hidden>
                  {regionFlag(r.region_code, r.currency_code)}
                </span>
                <span>{r.region_label}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {r.currency_code}
                </span>
                {isActive && <Check className="h-3.5 w-3.5 opacity-70" />}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          Prices, your order and your invoice are all in the currency shown here.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
