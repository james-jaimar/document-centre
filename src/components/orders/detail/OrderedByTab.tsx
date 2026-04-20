interface Props {
  order: any;
}

export function OrderedByTab({ order }: Props) {
  const profile = order.ordered_by;
  const phone = profile?.phone || null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="grid grid-cols-[100px_1fr] gap-y-2 text-sm">
        <span className="text-muted-foreground font-medium text-xs">Name</span>
        <span>{order.customer_name || "—"}</span>

        <span className="text-muted-foreground font-medium text-xs">Email</span>
        <span className="break-all">{order.customer_email || "—"}</span>

        <span className="text-muted-foreground font-medium text-xs">Phone</span>
        <span>{phone || "—"}</span>

        <span className="text-muted-foreground font-medium text-xs">Company</span>
        <span>{order.company_name || "—"}</span>
      </div>
    </div>
  );
}
