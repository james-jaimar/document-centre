interface Props {
  addresses: any[];
  order?: any;
}

export function OrderDeliveryTab({ addresses, order }: Props) {
  const delivery = addresses.find((a: any) => a.address_type === "delivery");
  const billing = addresses.find((a: any) => a.address_type === "billing");
  const branch = order?.branch;
  const isCollection =
    order?.fulfillment_type === "collection" ||
    (!delivery && !!branch);

  const renderBranch = () => (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold text-sm text-primary mb-1">Collection from Store</h3>
      <p className="text-xs text-muted-foreground mb-3">Customer will collect this order in-store.</p>
      {branch ? (
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{branch.name}</p>
          {branch.address && <p>{branch.address}</p>}
          {branch.city && <p>{branch.city}</p>}
          {(branch.postal_code || branch.province) && (
            <p>{[branch.postal_code, branch.province].filter(Boolean).join(" ")}</p>
          )}
          {branch.country && <p>{branch.country}</p>}
          {(branch.phone || branch.email) && (
            <div className="mt-3 pt-3 border-t space-y-0.5">
              <p className="font-semibold text-xs text-muted-foreground">Store Contact</p>
              {branch.phone && <p className="text-sm">{branch.phone}</p>}
              {branch.email && <p className="text-sm">{branch.email}</p>}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Branch details unavailable</p>
      )}
    </div>
  );

  const renderAddress = (addr: any, title: string) => {
    if (!addr) return (
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold text-sm text-primary mb-2">{title}</h3>
        <p className="text-xs text-muted-foreground">No address provided</p>
      </div>
    );

    return (
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold text-sm text-primary mb-3">{title}</h3>
        <div className="space-y-0.5 text-sm">
          {addr.company_name && <p className="font-medium">{addr.company_name}</p>}
          {addr.line1 && <p>{addr.line1}</p>}
          {addr.line2 && <p>{addr.line2}</p>}
          {addr.suburb && <p>{addr.suburb}</p>}
          {addr.city && <p>{addr.city}</p>}
          {(addr.postal_code || addr.province) && (
            <p>{[addr.postal_code, addr.province].filter(Boolean).join(" ")}</p>
          )}
          {addr.country && <p>{addr.country}</p>}
        </div>

        {(addr.phone || addr.email) && (
          <div className="mt-3 pt-3 border-t space-y-0.5">
            <p className="font-semibold text-xs text-muted-foreground">Contact Details</p>
            {addr.phone && <p className="text-sm">{addr.phone}</p>}
            {addr.email && <p className="text-sm">{addr.email}</p>}
          </div>
        )}

        {addr.instructions && (
          <div className="mt-3 pt-3 border-t">
            <p className="font-semibold text-xs text-muted-foreground">Instructions</p>
            <p className="text-sm">{addr.instructions}</p>
          </div>
        )}
      </div>
    );
  };

  if (isCollection) {
    return (
      <div className="space-y-4">
        {renderBranch()}
        {billing && renderAddress(billing, "Billing Address")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderAddress(delivery, "Delivery Address")}
      {renderAddress(billing, "Billing Address")}
    </div>
  );
}
