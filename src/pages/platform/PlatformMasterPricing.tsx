import MasterCatalogPricingEditor from "@/components/pricing/MasterCatalogPricingEditor";
import RateCardEditor from "@/components/pricing/RateCardEditor";
import MasterPackPricingEditor from "@/components/pricing/MasterPackPricingEditor";
import CatalogVariantsEditor from "@/components/pricing/CatalogVariantsEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PlatformMasterPricing() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Master Pricing</h1>
        <p className="text-sm text-muted-foreground">Pick a section below. Each one has its own screen.</p>
      </div>
      <Tabs defaultValue="catalogue" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="catalogue">Paper & Finishing</TabsTrigger>
          <TabsTrigger value="clicks">Click Charges & Products</TabsTrigger>
          <TabsTrigger value="packs">Pack Pricing</TabsTrigger>
          <TabsTrigger value="variants">Product Variants</TabsTrigger>
        </TabsList>
        <TabsContent value="catalogue" className="mt-6">
          <MasterCatalogPricingEditor />
        </TabsContent>
        <TabsContent value="clicks" className="mt-6">
          <RateCardEditor
            scope="master"
            title="Click Charges, Photo Prints & Business Cards"
            description="Per-click colour/mono rates and the standalone Photo Print and Business Card products."
          />
        </TabsContent>
        <TabsContent value="packs" className="mt-6">
          <MasterPackPricingEditor />
        </TabsContent>
        <TabsContent value="variants" className="mt-6">
          <CatalogVariantsEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
