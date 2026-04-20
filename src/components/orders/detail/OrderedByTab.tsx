interface Props {
  order: any;
  orderedByProfile?: {
    id: string;
    phone: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
  } | null;
}

export function OrderedByTab({ order, orderedByProfile }: Props) {
  const phone = orderedByProfile?.phone || null;
  const email = orderedByProfile?.email || order.customer_email || null;
  const name =
    orderedByProfile?.display_name ||
    [orderedByProfile?.first_name, orderedByProfile?.last_name].filter(Boolean).join(" ").trim() ||
    order.customer_name ||
    null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="grid grid-cols-[100px_1fr] gap-y-2 text-sm">
        <span className="text-muted-foreground font-medium text-xs">Name</span>
        <span>{name || "—"}</span>

        <span className="text-muted-foreground font-medium text-xs">Email</span>
        <span className="break-all">{email || "—"}</span>

        <span className="text-muted-foreground font-medium text-xs">Phone</span>
        <span>{phone || "—"}</span>

        <span className="text-muted-foreground font-medium text-xs">Company</span>
        <span>{order.company_name || "—"}</span>
      </div>
    </div>
  );
}
