import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";

export default function AppLayout() {
  return (
    <div className="flex h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
