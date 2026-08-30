import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  count: number;
  showCount?: boolean;
  onClick: () => void;
  className?: string;
}

/** Category tile for the shop index — image, label bar and product count. */
export default function CategoryCard({
  name,
  description,
  imageUrl,
  count,
  showCount = true,
  onClick,
  className,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:shadow-md",
        className,
      )}
    >
      <span className="relative block h-40 w-full overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full items-center justify-center">
            <FileText className="h-9 w-9 text-muted-foreground/40" aria-hidden />
          </span>
        )}
        {showCount && (
          <span className="sf-accent-bg absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold">
            {count}
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col gap-1 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{name}</span>
        {description && (
          <span className="line-clamp-2 text-xs text-muted-foreground">{description}</span>
        )}
      </span>
    </button>
  );
}
