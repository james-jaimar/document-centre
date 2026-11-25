import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MasterCatalogPricingEditor from "@/components/pricing/MasterCatalogPricingEditor";

const { opened } = vi.hoisted(() => ({ opened: vi.fn() }));

vi.mock("@/components/pricing/PriceBreaksModal", () => ({
  default: ({ open, line }: { open: boolean; line: unknown }) => {
    if (open) opened(line);
    return null;
  },
}));
vi.mock("@/hooks/useCatalog", () => ({
  useCatalogPapers: () => ({ data: [{ id: "paper-bond", label: "80gsm Bond", weight_gsm: 80, is_active: true, stocked_sizes: ["a4"] }] }),
  useCatalogFinishing: () => ({ data: [{ id: "finish-binding", label: "Binding", is_active: true, pricing_basis: "per_unit" }] }),
  useCatalogSizes: () => ({ data: [] }),
  usePatchCatalogPaper: () => ({}),
  usePatchCatalogFinishing: () => ({}),
}));
vi.mock("@/hooks/useCatalogPrices", () => ({
  useCatalogPaperPrices: () => ({ data: [{ id: "paper-price-a4", paper_id: "paper-bond", size_code: "a4", sell_price_minor: 125, cost_price_minor: 75 }] }),
  useCatalogFinishingPrices: () => ({ data: [{ id: "binding-price", finishing_id: "finish-binding", size_code: "any", sell_price_minor: 750, cost_price_minor: 300, is_active: true }] }),
  useUpsertCatalogPaperPrice: () => ({}),
  useDeleteCatalogPaperPrice: () => ({}),
  useUpsertCatalogFinishingPrice: () => ({}),
  useDeleteCatalogFinishingPrice: () => ({}),
}));
vi.mock("@/hooks/useCatalogCascade", () => ({
  useCloneMasterCatalogToTenant: () => ({}),
  useResyncTenantCatalogFromMaster: () => ({}),
  useCloneTenantCatalogToBranch: () => ({}),
  useResyncBranchCatalogFromTenant: () => ({}),
}));

afterEach(() => {
  cleanup();
  opened.mockClear();
});

describe("catalogue price-break editor integration", () => {
  for (const scope of ["master", "tenant", "branch"] as const) {
    const tenantId = scope === "master" ? null : "tenant-one";
    const branchId = scope === "branch" ? "branch-one" : null;

    it(`opens paper-size tiers with ZAR defaults and ${scope} ownership`, () => {
      render(<MasterCatalogPricingEditor scope={scope} tenantId={tenantId} branchId={branchId} />);
      fireEvent.click(screen.getByRole("button", { name: /Edit quantity price breaks for 80gsm Bond/ }));
      expect(opened).toHaveBeenLastCalledWith(expect.objectContaining({
        table: "papers", id: "paper-price-a4", fallback_sell: 1.25, fallback_cost: 0.75,
        scope_type: scope, tenant_id: tenantId, branch_id: branchId,
      }));
    });

    it(`opens finishing-price tiers with ZAR defaults and ${scope} ownership`, () => {
      render(<MasterCatalogPricingEditor scope={scope} tenantId={tenantId} branchId={branchId} />);
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Finishing" }), { button: 0, ctrlKey: false });
      fireEvent.click(screen.getByRole("button", { name: /Edit quantity price breaks for Binding/ }));
      expect(opened).toHaveBeenLastCalledWith(expect.objectContaining({
        table: "finishing", id: "binding-price", fallback_sell: 7.5, fallback_cost: 3,
        scope_type: scope, tenant_id: tenantId, branch_id: branchId,
      }));
    });
  }
});