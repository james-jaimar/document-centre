import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";

import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";

// Customer
import CustomerDashboard from "@/pages/dashboard/CustomerDashboard";
import CustomerOrders from "@/pages/dashboard/CustomerOrders";
import CustomerSettings from "@/pages/dashboard/CustomerSettings";
import NewOrder from "@/pages/dashboard/NewOrder";
import OrderFiles from "@/pages/dashboard/OrderFiles";
import OrderBuild from "@/pages/dashboard/OrderBuild";

// Branch
import BranchDashboard from "@/pages/branch/BranchDashboard";
import BranchSettings from "@/pages/branch/BranchSettings";

// Admin
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminBranches from "@/pages/admin/AdminBranches";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminPricing from "@/pages/admin/AdminPricing";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminSettings from "@/pages/admin/AdminSettings";

// Platform
import PlatformTenants from "@/pages/platform/PlatformTenants";
import PlatformSettings from "@/pages/platform/PlatformSettings";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected shell */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              {/* Customer */}
              <Route path="/dashboard" element={<CustomerDashboard />} />
              <Route path="/dashboard/orders" element={<CustomerOrders />} />
              <Route path="/dashboard/settings" element={<CustomerSettings />} />

              {/* Branch */}
              <Route path="/branch" element={
                <ProtectedRoute allowedRoles={["branch_manager", "store_operator", "head_office_admin", "platform_admin"]}>
                  <BranchDashboard />
                </ProtectedRoute>
              } />
              <Route path="/branch/settings" element={
                <ProtectedRoute allowedRoles={["branch_manager", "head_office_admin", "platform_admin"]}>
                  <BranchSettings />
                </ProtectedRoute>
              } />

              {/* Admin */}
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={["head_office_admin", "platform_admin"]}>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
              <Route path="/admin/branches" element={
                <ProtectedRoute allowedRoles={["head_office_admin", "platform_admin"]}>
                  <AdminBranches />
                </ProtectedRoute>
              } />
              <Route path="/admin/products" element={
                <ProtectedRoute allowedRoles={["head_office_admin", "platform_admin"]}>
                  <AdminProducts />
                </ProtectedRoute>
              } />
              <Route path="/admin/pricing" element={
                <ProtectedRoute allowedRoles={["head_office_admin", "platform_admin"]}>
                  <AdminPricing />
                </ProtectedRoute>
              } />
              <Route path="/admin/users" element={
                <ProtectedRoute allowedRoles={["head_office_admin", "platform_admin"]}>
                  <AdminUsers />
                </ProtectedRoute>
              } />
              <Route path="/admin/settings" element={
                <ProtectedRoute allowedRoles={["head_office_admin", "platform_admin"]}>
                  <AdminSettings />
                </ProtectedRoute>
              } />

              {/* Platform */}
              <Route path="/platform" element={
                <ProtectedRoute allowedRoles={["platform_admin"]}>
                  <PlatformTenants />
                </ProtectedRoute>
              } />
              <Route path="/platform/settings" element={
                <ProtectedRoute allowedRoles={["platform_admin"]}>
                  <PlatformSettings />
                </ProtectedRoute>
              } />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
