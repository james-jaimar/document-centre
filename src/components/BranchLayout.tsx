import { Outlet } from "react-router-dom";
import BranchSidebar from "@/components/BranchSidebar";

export default function BranchLayout() {
  return (
    <div className="flex h-screen w-full bg-background">
      <BranchSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
