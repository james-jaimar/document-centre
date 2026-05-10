import RateCardEditor from "@/components/pricing/RateCardEditor";

export default function PlatformMasterPricing() {
  return (
    <div className="p-6">
      <RateCardEditor
        scope="master"
        title="Master Rate Card"
        description="The platform-wide source of truth for click charges, paper stocks and finishing prices. Each tenant inherits a clone that they can edit independently."
      />
    </div>
  );
}
