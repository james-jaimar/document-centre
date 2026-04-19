import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import BranchLayout from "@/components/BranchLayout";
import CustomerLayout from "@/components/CustomerLayout";

import Auth from "@/pages/Auth";
import AuthCallback from "@/pages/AuthCallback";
import AuthVerify from "@/pages/AuthVerify";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";
import { StorefrontRedirect } from "@/components/StorefrontRedirect";
import { AppEntryRedirect } from "@/components/AppEntryRedirect";
import StorefrontLanding from "@/pages/storefront/StorefrontLanding";
import MarketingLanding from "@/pages/MarketingLanding";

// Customer
import CustomerDashboard from "@/pages/dashboard/CustomerDashboard";
import CustomerOrders from "@/pages/dashboard/CustomerOrders";
import CustomerAccount from "@/pages/dashboard/CustomerAccount";
import NewOrder from "@/pages/dashboard/NewOrder";
import OrderFiles from "@/pages/dashboard/OrderFiles";
import OrderBuild from "@/pages/dashboard/OrderBuild";
import Cart from "@/pages/dashboard/Cart";
import Checkout from "@/pages/dashboard/Checkout";
import OrderConfirmation from "@/pages/dashboard/OrderConfirmation";
import CustomerOrderDetail from "@/pages/dashboard/CustomerOrderDetail";

// Admin
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminBranches from "@/pages/admin/AdminBranches";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminPricing from "@/pages/admin/AdminPricing";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminBranchDetail from "@/pages/admin/AdminBranchDetail";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminCustomerDetail from "@/pages/admin/AdminCustomerDetail";

// Branch portal
import BranchDashboard from "@/pages/branch/BranchDashboard";
import BranchOrders from "@/pages/branch/BranchOrders";
import BranchProducts from "@/pages/branch/BranchProducts";
import BranchSettings from "@/pages/branch/BranchSettings";

// Platform
import PlatformTenants from "@/pages/platform/PlatformTenants";
import PlatformUsers from "@/pages/platform/PlatformUsers";
import PlatformSettings from "@/pages/platform/PlatformSettings";

const queryClient = new QueryClient();

const adminRoles = ["head_office_admin", "platform_admin"] as const;
const operationsRoles = ["branch_manager", "store_operator", "head_office_admin", "platform_admin"] as const;
const branchRoles = ["branch_manager", "store_operator", "head_office_admin", "platform_admin"] as const;

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
            <Route path="/t/:slug/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/t/:slug/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/verify" element={<AuthVerify />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Public storefront landing */}
            <Route path="/t/:slug" element={<StorefrontLanding />} />

            {/* Customer portal — slug-based storefront */}
            <Route path="/t/:slug" element={<ProtectedRoute><CustomerLayout /></ProtectedRoute>}>
              <Route path="dashboard" element={<CustomerDashboard />} />
              <Route path="orders/:id" element={<CustomerOrderDetail />} />
              <Route path="orders" element={<CustomerOrders />} />
              <Route path="orders/new" element={<NewOrder />} />
              <Route path="orders/new/:familyId" element={<OrderFiles />} />
              <Route path="orders/:id/files" element={<OrderFiles />} />
              <Route path="orders/:id/build" element={<OrderBuild />} />
              <Route path="orders/:id/confirmation" element={<OrderConfirmation />} />
              <Route path="cart" element={<Cart />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="account" element={<CustomerAccount />} />
              <Route path="settings" element={<CustomerAccount />} />
            </Route>

            {/* Legacy /dashboard redirects to slug-based URL */}
            <Route path="/dashboard/*" element={<ProtectedRoute><StorefrontRedirect /></ProtectedRoute>} />

            {/* Branch Portal — dedicated layout */}
            <Route element={<ProtectedRoute allowedRoles={[...branchRoles]} allowedMembershipRoles={["branch_manager", "store_operator", "owner", "admin"]}><BranchLayout /></ProtectedRoute>}>
              <Route path="/branch" element={<BranchDashboard />} />
              <Route path="/branch/orders" element={<BranchOrders />} />
              <Route path="/branch/products" element={<BranchProducts />} />
              <Route path="/branch/settings" element={<BranchSettings />} />
            </Route>
            <Route path="/admin/branch/products" element={<Navigate to="/branch/products" replace />} />
            <Route path="/admin/branch/settings" element={<Navigate to="/branch/settings" replace />} />

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
              <Route path="/admin/branches/:id" element={
                <ProtectedRoute allowedRoles={[...adminRoles]}>
                  <AdminBranchDetail />
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
              <Route path="/admin/customers" element={
                <ProtectedRoute allowedRoles={[...adminRoles]}>
                  <AdminCustomers />
                </ProtectedRoute>
              } />
              <Route path="/admin/customers/:id" element={
                <ProtectedRoute allowedRoles={[...adminRoles]}>
                  <AdminCustomerDetail />
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
              <Route path="/platform/users" element={
                <ProtectedRoute allowedRoles={["platform_admin"]}>
                  <PlatformUsers />
                </ProtectedRoute>
              } />
              <Route path="/platform/settings" element={
                <ProtectedRoute allowedRoles={["platform_admin"]}>
                  <PlatformSettings />
                </ProtectedRoute>
              } />
            </Route>

            {/* Public marketing landing — always shown at root */}
            <Route path="/" element={<MarketingLanding />} />
            {/* Authenticated entry: redirects users to their portal */}
            <Route path="/app" element={<AppEntryRedirect />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
