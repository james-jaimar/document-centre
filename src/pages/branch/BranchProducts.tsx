import { useTenantContext } from "@/hooks/useTenantContext";
import BranchProductToggles from "@/components/branch/BranchProductToggles";

const BranchProducts = () => {
  const { branchId } = useTenantContext();

  if (!branchId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">My Products</h1>
        <p className="text-muted-foreground">No branch assigned to your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Products</h1>
        <p className="text-muted-foreground">Toggle which products your branch can produce</p>
      </div>
      <BranchProductToggles branchId={branchId} />
    </div>
  );
};

export default BranchProducts;
