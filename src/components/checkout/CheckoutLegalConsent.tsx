import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollText } from "lucide-react";
import { useLegalDocument } from "@/hooks/useLegalDocument";

export interface CheckoutLegalAcceptance {
  terms_updated_at: string | null;
  privacy_updated_at: string | null;
}

interface Props {
  tenantId: string | null;
  termsHref: string;
  privacyHref: string;
  onChange: (accepted: CheckoutLegalAcceptance | null) => void;
}

/**
 * Single-checkbox consent shown immediately before the Place Order
 * button on the storefront checkout. Captures the timestamps of the
 * tenant's currently-published Terms and Privacy Policy so an immutable
 * row can be written to `order_legal_acceptances` after the order is
 * created.
 */
export function CheckoutLegalConsent({ tenantId, termsHref, privacyHref, onChange }: Props) {
  const terms = useLegalDocument(tenantId, "terms");
  const privacy = useLegalDocument(tenantId, "privacy");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    onChange(
      checked
        ? {
            terms_updated_at: terms.updatedAt,
            privacy_updated_at: privacy.updatedAt,
          }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, terms.updatedAt, privacy.updatedAt]);

  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3 flex items-start gap-2">
      <ScrollText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex items-start gap-2 flex-1">
        <Checkbox
          id="checkout-legal-consent"
          checked={checked}
          onCheckedChange={(v) => setChecked(v === true)}
          className="mt-0.5"
        />
        <Label
          htmlFor="checkout-legal-consent"
          className="text-sm font-normal leading-snug cursor-pointer"
        >
          I agree to the{" "}
          <Link to={termsHref} target="_blank" rel="noreferrer" className="underline">
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link to={privacyHref} target="_blank" rel="noreferrer" className="underline">
            Privacy Policy
          </Link>
          .
        </Label>
      </div>
    </div>
  );
}

export default CheckoutLegalConsent;
