import { cn } from "@/lib/utils";

export interface PriceBreakRow {
  qty: number;
  priceMajor: number;
}

export default function PriceBreakTable({
  rows,
  activeQty,
  format,
  onSelect,
}: {
  rows: PriceBreakRow[];
  activeQty?: number | null;
  format: (major: number) => string;
  onSelect?: (qty: number) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Quantity</th>
            <th className="px-4 py-2.5 text-right font-medium">Price</th>
            <th className="px-4 py-2.5 text-right font-medium">Per unit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = activeQty === row.qty;
            return (
              <tr
                key={row.qty}
                onClick={onSelect ? () => onSelect(row.qty) : undefined}
                className={cn(
                  "border-t transition-colors",
                  onSelect && "cursor-pointer hover:bg-muted/40",
                  active && "bg-primary/10",
                )}
              >
                <td className={cn("px-4 py-2.5", active && "font-semibold")}>
                  {row.qty.toLocaleString()}
                </td>
                <td className={cn("px-4 py-2.5 text-right tabular-nums", active && "font-semibold")}>
                  {format(row.priceMajor)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {format(row.priceMajor / Math.max(1, row.qty))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
