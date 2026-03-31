import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import CustomerLayout from "@/components/CustomerLayout";

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

// Admin (includes former Branch pages)
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminBranches from "@/pages/admin/AdminBranches";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminPricing from "@/pages/admin/AdminPricing";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminBranchDetail from "@/pages/admin/AdminBranchDetail";
import BranchDashboard from "@/pages/branch/BranchDashboard";

// Platform
import PlatformTenants from "@/pages/platform/PlatformTenants";
import PlatformSettings from "@/pages/platform/PlatformSettings";

const queryClient = new QueryClient();

const adminRoles = ["head_office_admin", "platform_admin"] as const;
const operationsRoles = ["branch_manager", "store_operator", "head_office_admin", "platform_admin"] as const;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
          <Routes>
            {/* Public */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Customer portal — dedicated layout */}
            <Route element={<ProtectedRoute><CustomerLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<CustomerDashboard />} />
              <Route path="/dashboard/orders" element={<CustomerOrders />} />
              <Route path="/dashboard/orders/new" element={<NewOrder />} />
              <Route path="/dashboard/orders/:id/files" element={<OrderFiles />} />
              <Route path="/dashboard/orders/:id/build" element={<OrderBuild />} />
              <Route path="/dashboard/settings" element={<CustomerSettings />} />
            </Route>

            {/* Admin & Platform — shared AppLayout */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              {/* Admin — Operations */}
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={[...operationsRoles]}>
                  <AdminDashboard />
                </ProtectedRoute>
              } />
              <Route path="/admin/orders" element={
                <ProtectedRoute allowedRoles={[...operationsRoles]}>
                  <AdminOrders />
                </ProtectedRoute>
              } />
              <Route path="/admin/orders/:id" element={
                <ProtectedRoute allowedRoles={[...operationsRoles]}>
                  <AdminOrderDetail />
                </ProtectedRoute>
              } />
              <Route path="/admin/production" element={
                <ProtectedRoute allowedRoles={[...operationsRoles]}>
                  <BranchDashboard />
                </ProtectedRoute>
              } />

              {/* Admin — Configuration */}
              <Route path="/admin/branches" element={
                <ProtectedRoute allowedRoles={[...adminRoles]}>
                  <AdminBranches />
                </ProtectedRoute>
              } />
              <Route path="/admin/products" element={
                <ProtectedRoute allowedRoles={[...adminRoles]}>
                  <AdminProducts />
                </ProtectedRoute>
              } />
              <Route path="/admin/pricing" element={
                <ProtectedRoute allowedRoles={[...adminRoles]}>
                  <AdminPricing />
                </ProtectedRoute>
              } />
              <Route path="/admin/users" element={
                <ProtectedRoute allowedRoles={[...adminRoles]}>
                  <AdminUsers />
                </ProtectedRoute>
              } />

              {/* Admin — Settings */}
              <Route path="/admin/settings" element={
                <ProtectedRoute allowedRoles={[...adminRoles]}>
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
            <Route path="/branch" element={<Navigate to="/admin/production" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
