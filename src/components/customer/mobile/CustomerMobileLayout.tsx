import { Outlet } from "react-router-dom";
import MobileHeader from "./MobileHeader";
import MobileTabBar, { useTabBarHidden } from "./MobileTabBar";

export default function CustomerMobileLayout() {
  const tabHidden = useTabBarHidden();
  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background">
      <MobileHeader />
      <main
        className="flex-1 customer-body px-4 py-4"
        style={{ paddingBottom: tabHidden ? "1rem" : "calc(5rem + env(safe-area-inset-bottom))" }}
      >
        <Outlet />
      </main>
      <MobileTabBar />
    </div>
  );
}
