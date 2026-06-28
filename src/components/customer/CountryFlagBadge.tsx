import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COUNTRY_LIST, getCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";

interface Props {
  countryCode: string | null | undefined;
  compact?: boolean; // mobile: flag-only chip
}

/**
 * Storefront country indicator. Shows the tenant's country as an emoji-flag chip.
 * Dropdown lists known countries; unavailable ones are disabled with a "Coming soon" label.
 *
 * TODO (Phase 2): wire to `detect-region` edge function for auto geolocate
 * once a non-ZA tenant exists.
 */
export default function CountryFlagBadge({ countryCode, compact = false }: Props) {
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
              onSelect={(e) => {
                // No-op for now — selecting a country is a Phase 2 concern.
                e.preventDefault();
              }}
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
