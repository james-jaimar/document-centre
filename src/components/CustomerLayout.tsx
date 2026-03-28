import { Outlet } from "react-router-dom";
import CustomerSidebar from "@/components/CustomerSidebar";
import { Bell, Menu, Search, ShoppingCart, User, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { SidebarCollapseProvider, useSidebarCollapse } from "@/hooks/useSidebarCollapse";

function CustomerLayoutInner() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggle } = useSidebarCollapse();

  return (
    <div className="flex h-screen w-full">
      {/* Desktop sidebar — animated collapse */}
      <div
        className={`hidden lg:flex transition-all duration-300 ease-in-out overflow-hidden ${
          collapsed ? "w-0" : "w-64"
        }`}
      >
        <CustomerSidebar />
      </div>

      {/* Collapse toggle tab — visible when sidebar is collapsed */}
      {collapsed && (
        <button
          onClick={toggle}
          className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-6 h-16 rounded-r-lg bg-sidebar border border-l-0 border-sidebar-border shadow-md hover:w-8 transition-all duration-200 group"
          title="Open sidebar"
        >
          <PanelLeftOpen className="h-4 w-4 text-sidebar-foreground/70 group-hover:text-sidebar-foreground transition-colors" />
        </button>
      )}

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="print-sidebar w-64 h-full px-5 py-6 flex"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Reuses sidebar styles inline for mobile — in future can extract */}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="print-topbar">
          <button
            className="rounded-xl p-2 hover:bg-secondary lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu className="h-5 w-5 text-muted-foreground" />
          </button>

          <div className="search-shell max-w-3xl">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              className="search-input"
              placeholder="Search files, products or orders"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="relative rounded-xl p-2 hover:bg-secondary">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-success" />
            </button>
            <button className="relative rounded-xl p-2 hover:bg-secondary">
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            </button>
            <button className="rounded-full border border-border bg-white p-1 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-primary text-primary-foreground">
                <User className="h-4 w-4" />
              </div>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto customer-body p-6 xl:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function CustomerLayout() {
  return (
    <SidebarCollapseProvider>
      <CustomerLayoutInner />
    </SidebarCollapseProvider>
  );
}
