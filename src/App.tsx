import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenantContext";
import { useGAPageViews } from "@/hooks/useGAPageViews";
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
import { SubdomainWrapper, useSubdomainTenant } from "@/components/SubdomainRouter";
import BranchSlugRoute from "@/components/BranchSlugRoute";

import MarketingLanding from "@/pages/MarketingLanding";
import Try from "@/pages/Try";
import Pricing from "@/pages/Pricing";
import Contact from "@/pages/Contact";
import PrivacyPolicy from "@/pages/legal/PrivacyPolicy";
import TermsOfService from "@/pages/legal/TermsOfService";
import PlatformDemoActivity from "@/pages/platform/PlatformDemoActivity";
import MobileUpload from "@/pages/MobileUpload";

// Customer
import CustomerDashboard from "@/pages/dashboard/CustomerDashboard";
import CustomerOrders from "@/pages/dashboard/CustomerOrders";
import CustomerAccount from "@/pages/dashboard/CustomerAccount";
import NewOrder from "@/pages/dashboard/NewOrder";
import OrderFiles from "@/pages/dashboard/OrderFiles";
import OrderBuild from "@/pages/dashboard/OrderBuild";
import PhotoPrintsBuilder from "@/pages/dashboard/PhotoPrintsBuilder";
import Cart from "@/pages/dashboard/Cart";
import Checkout from "@/pages/dashboard/Checkout";
import OrderConfirmation from "@/pages/dashboard/OrderConfirmation";
import CustomerOrderDetail from "@/pages/dashboard/CustomerOrderDetail";
import PortalTerms from "@/pages/dashboard/PortalTerms";
import PortalPrivacy from "@/pages/dashboard/PortalPrivacy";
import CustomerQuotes from "@/pages/dashboard/CustomerQuotes";
import CustomerQuoteDetail from "@/pages/dashboard/CustomerQuoteDetail";

// Admin
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminBranches from "@/pages/admin/AdminBranches";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminProductCatalogue from "@/pages/admin/AdminProductCatalogue";
import AdminPricing from "@/pages/admin/AdminPricing";
import AdminRateCard from "@/pages/admin/AdminRateCard";
import AdminDelivery from "@/pages/admin/AdminDelivery";
import AdminBranchDelivery from "@/pages/admin/AdminBranchDelivery";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminProductionQueue from "@/pages/admin/AdminProductionQueue";
import AdminBranchDetail from "@/pages/admin/AdminBranchDetail";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminCustomerDetail from "@/pages/admin/AdminCustomerDetail";
import AdminSentMail from "@/pages/admin/AdminSentMail";
import AdminDocuments from "@/pages/admin/AdminDocuments";
import AdminBindingArtworkAudit from "@/pages/admin/AdminBindingArtworkAudit";
import AdminQuotes from "@/pages/admin/AdminQuotes";
import AdminQuoteDetail from "@/pages/admin/AdminQuoteDetail";
import AdminQuoteCreate from "@/pages/admin/AdminQuoteCreate";

// Branch portal
import BranchDashboard from "@/pages/branch/BranchDashboard";
import BranchOrders from "@/pages/branch/BranchOrders";
import BranchOrderDetail from "@/pages/branch/BranchOrderDetail";
import BranchProducts from "@/pages/branch/BranchProducts";
import BranchPricing from "@/pages/branch/BranchPricing";
import BranchRateCard from "@/pages/branch/BranchRateCard";
import BranchDelivery from "@/pages/branch/BranchDelivery";
import BranchQuotes from "@/pages/branch/BranchQuotes";
import BranchQuoteDetail from "@/pages/branch/BranchQuoteDetail";
import BranchSettings from "@/pages/branch/BranchSettings";
import BranchCustomers from "@/pages/branch/BranchCustomers";

// Platform
import PlatformTenants from "@/pages/platform/PlatformTenants";
import PlatformUsers from "@/pages/platform/PlatformUsers";
import PlatformSettings from "@/pages/platform/PlatformSettings";
import PlatformPricingRegions from "@/pages/platform/PlatformPricingRegions";
import PlatformProducts from "@/pages/platform/PlatformProducts";
import PlatformMasterPricing from "@/pages/platform/PlatformMasterPricing";
import PlatformSubscriptions from "@/pages/platform/PlatformSubscriptions";
import PlatformDemoPrintPricing from "@/pages/platform/PlatformDemoPrintPricing";
import PlatformImposition from "@/pages/platform/PlatformImposition";
import DocumentCentreLayout from "@/components/platform/DocumentCentreLayout";
import PlatformDocumentCentreOverview from "@/pages/platform/PlatformDocumentCentreOverview";
import PlatformDocumentCentreQueues from "@/pages/platform/PlatformDocumentCentreQueues";
import PlatformDocumentCentreWorkers from "@/pages/platform/PlatformDocumentCentreWorkers";
import PlatformDocumentCentreJobs from "@/pages/platform/PlatformDocumentCentreJobs";
import PlatformDocumentCentreAssets from "@/pages/platform/PlatformDocumentCentreAssets";
import PlatformDocumentCentreMetrics from "@/pages/platform/PlatformDocumentCentreMetrics";
import PlatformDocumentCentreStorage from "@/pages/platform/PlatformDocumentCentreStorage";
import PlatformDocumentCentreConfig from "@/pages/platform/PlatformDocumentCentreConfig";
import PlatformDocumentCentreAudit from "@/pages/platform/PlatformDocumentCentreAudit";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const adminRoles = ["head_office_admin", "platform_admin"] as const;
const operationsRoles = ["branch_manager", "store_operator", "head_office_admin", "platform_admin"] as const;
const branchRoles = ["branch_manager", "store_operator", "head_office_admin", "platform_admin"] as const;

// Membership-role allowances (parallel to legacy app roles, evaluated together).
const adminMembershipRoles = ["owner", "admin"];
const operationsMembershipRoles = ["owner", "admin", "sales", "production", "accounts"];

function customerRoutes() {
  return (
    <>
      <Route index element={<CustomerDashboard />} />
      <Route path="dashboard" element={<CustomerDashboard />} />
      <Route path="print-centre" element={<CustomerDashboard />} />
      {/* Public routes */}
      <Route path="orders/new" element={<NewOrder />} />
      <Route path="orders/new/photo-prints" element={<PhotoPrintsBuilder />} />
      <Route path="orders/new/:familyId" element={<OrderFiles />} />
      <Route path="orders/:id/files" element={<OrderFiles />} />
      <Route path="orders/:id/build" element={<OrderBuild />} />
      <Route path="orders/:id/photo-prints" element={<PhotoPrintsBuilder />} />
      <Route path="cart" element={<Cart />} />
      <Route path="checkout" element={<Checkout />} />
      <Route path="terms" element={<PortalTerms />} />
      <Route path="privacy" element={<PortalPrivacy />} />
      {/* Auth-required routes */}
      <Route path="orders/:id" element={<ProtectedRoute><CustomerOrderDetail /></ProtectedRoute>} />
      <Route path="orders/:id/confirmation" element={<ProtectedRoute><OrderConfirmation /></ProtectedRoute>} />
      <Route path="orders" element={<ProtectedRoute><CustomerOrders /></ProtectedRoute>} />
      <Route path="quotes" element={<ProtectedRoute><CustomerQuotes /></ProtectedRoute>} />
      <Route path="quotes/:id" element={<ProtectedRoute><CustomerQuoteDetail /></ProtectedRoute>} />
      <Route path="account" element={<ProtectedRoute><CustomerAccount /></ProtectedRoute>} />
      <Route path="settings" element={<ProtectedRoute><CustomerAccount /></ProtectedRoute>} />
    </>
  );
}

function AppRoutes() {
  const { matched } = useSubdomainTenant();

  return (
    <Routes>
      {/* Public */}
      <Route path="/auth" element={<Auth />} />
      <Route path="/t/:slug/auth" element={<Auth />} />
      <Route path="/t/:slug/:branchSlug/auth" element={<Auth />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/t/:slug/auth/callback" element={<AuthCallback />} />
      <Route path="/t/:slug/:branchSlug/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/verify" element={<AuthVerify />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Public legal pages */}
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/contact" element={<Contact />} />

      {/* Public mobile upload — no auth required */}
      <Route path="/upload/:token" element={<MobileUpload />} />

      {/* Customer portal — slug-based storefront (public layout, auth only where needed) */}
      <Route path="/t/:slug" element={<CustomerLayout />}>
        {customerRoutes()}
        {/* Branch-scoped variants: /t/:slug/:branchSlug/... */}
        <Route path=":branchSlug" element={<BranchSlugRoute />}>
          {customerRoutes()}
        </Route>
      </Route>

      {/* Customer portal — subdomain-based (same routes as /t/:slug but at root) — only when on a tenant subdomain */}
      {matched && (
        <>
          <Route path="/:branchSlug/auth" element={<Auth />} />
          <Route path="/:branchSlug/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<CustomerLayout />}>
            {customerRoutes()}
            <Route path=":branchSlug" element={<BranchSlugRoute />}>
              {customerRoutes()}
            </Route>
          </Route>
        </>
      )}

      {/* Legacy /dashboard redirects to slug-based URL */}
      <Route path="/dashboard/*" element={<ProtectedRoute><StorefrontRedirect /></ProtectedRoute>} />

      {/* Branch Portal — dedicated layout */}
      <Route element={<ProtectedRoute allowedRoles={[...branchRoles]} allowedMembershipRoles={["branch_manager", "store_operator", "owner", "admin"]}><BranchLayout /></ProtectedRoute>}>
        <Route path="/branch" element={<BranchDashboard />} />
        <Route path="/branch/orders" element={<BranchOrders />} />
        <Route path="/branch/orders/:id" element={<BranchOrderDetail />} />
        <Route path="/branch/products" element={<BranchProducts />} />
        <Route path="/branch/pricing" element={<BranchPricing />} />
        <Route path="/branch/rate-card" element={<BranchRateCard />} />
        <Route path="/branch/delivery" element={<BranchDelivery />} />
        <Route path="/branch/quotes" element={<BranchQuotes />} />
        <Route path="/branch/quotes/:id" element={<BranchQuoteDetail />} />
        <Route path="/branch/customers" element={<BranchCustomers />} />
        <Route path="/branch/settings" element={<BranchSettings />} />
      </Route>
      <Route path="/admin/branch/products" element={<Navigate to="/branch/products" replace />} />
      <Route path="/admin/branch/settings" element={<Navigate to="/branch/settings" replace />} />

      {/* Admin & Platform — shared AppLayout */}
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        {/* Admin — Operations */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={[...operationsRoles]} allowedMembershipRoles={operationsMembershipRoles}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/admin/orders" element={
          <ProtectedRoute allowedRoles={[...operationsRoles]} allowedMembershipRoles={operationsMembershipRoles}>
            <AdminOrders />
          </ProtectedRoute>
        } />
        <Route path="/admin/orders/:id" element={
          <ProtectedRoute allowedRoles={[...operationsRoles]} allowedMembershipRoles={operationsMembershipRoles}>
            <AdminOrderDetail />
          </ProtectedRoute>
        } />
        <Route path="/admin/quotes" element={
          <ProtectedRoute allowedRoles={[...operationsRoles]} allowedMembershipRoles={operationsMembershipRoles}>
            <AdminQuotes />
          </ProtectedRoute>
        } />
        <Route path="/admin/quotes/new" element={
          <ProtectedRoute allowedRoles={[...operationsRoles]} allowedMembershipRoles={operationsMembershipRoles}>
            <AdminQuoteCreate />
          </ProtectedRoute>
        } />
        <Route path="/admin/quotes/:id" element={
          <ProtectedRoute allowedRoles={[...operationsRoles]} allowedMembershipRoles={operationsMembershipRoles}>
            <AdminQuoteDetail />
          </ProtectedRoute>
        } />
        <Route path="/admin/production" element={
          <ProtectedRoute allowedRoles={[...operationsRoles]} allowedMembershipRoles={operationsMembershipRoles}>
            <AdminProductionQueue />
          </ProtectedRoute>
        } />

        {/* Admin — Configuration */}
        <Route path="/admin/branches" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminBranches />
          </ProtectedRoute>
        } />
        <Route path="/admin/branches/:id" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminBranchDetail />
          </ProtectedRoute>
        } />
        <Route path="/admin/products" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminProductCatalogue />
          </ProtectedRoute>
        } />
        <Route path="/admin/binding-artwork-audit" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminBindingArtworkAudit />
          </ProtectedRoute>
        } />
        {/* Tenant rate card (clone of master) */}
        <Route path="/admin/pricing" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminRateCard />
          </ProtectedRoute>
        } />
        <Route path="/admin/delivery" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminDelivery />
          </ProtectedRoute>
        } />
        <Route path="/admin/branches/:id/delivery" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminBranchDelivery />
          </ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminUsers />
          </ProtectedRoute>
        } />
        <Route path="/admin/customers" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminCustomers />
          </ProtectedRoute>
        } />
        <Route path="/admin/customers/:id" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminCustomerDetail />
          </ProtectedRoute>
        } />

        {/* Admin — Communications */}
        <Route path="/admin/sent-mail" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminSentMail />
          </ProtectedRoute>
        } />
        <Route path="/admin/documents" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
            <AdminDocuments />
          </ProtectedRoute>
        } />

        {/* Admin — Settings */}
        <Route path="/admin/settings" element={
          <ProtectedRoute allowedRoles={[...adminRoles]} allowedMembershipRoles={adminMembershipRoles}>
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
        <Route path="/platform/demo" element={
          <ProtectedRoute allowedRoles={["platform_admin"]}>
            <PlatformDemoActivity />
          </ProtectedRoute>
        } />
        <Route path="/platform/products" element={
          <ProtectedRoute allowedRoles={["platform_admin"]}>
            <PlatformProducts />
          </ProtectedRoute>
        } />
        <Route path="/platform/master-pricing" element={
          <ProtectedRoute allowedRoles={["platform_admin"]}>
            <PlatformMasterPricing />
          </ProtectedRoute>
        } />
        <Route path="/platform/pricing" element={
          <ProtectedRoute allowedRoles={["platform_admin"]}>
            <PlatformPricingRegions />
          </ProtectedRoute>
        } />
        <Route path="/platform/subscriptions" element={
          <ProtectedRoute allowedRoles={["platform_admin"]}>
            <PlatformSubscriptions />
          </ProtectedRoute>
        } />
        <Route path="/platform/demo-print-pricing" element={
          <ProtectedRoute allowedRoles={["platform_admin"]}>
            <PlatformDemoPrintPricing />
          </ProtectedRoute>
        } />
        <Route path="/platform/imposition" element={
          <ProtectedRoute allowedRoles={["platform_admin"]}>
            <PlatformImposition />
          </ProtectedRoute>
        } />
        <Route path="/platform/document-centre" element={
          <ProtectedRoute allowedRoles={["platform_admin"]}>
            <DocumentCentreLayout />
          </ProtectedRoute>
        }>
          <Route index element={<PlatformDocumentCentreOverview />} />
          <Route path="queues" element={<PlatformDocumentCentreQueues />} />
          <Route path="workers" element={<PlatformDocumentCentreWorkers />} />
          <Route path="jobs" element={<PlatformDocumentCentreJobs />} />
          <Route path="assets" element={<PlatformDocumentCentreAssets />} />
          <Route path="metrics" element={<PlatformDocumentCentreMetrics />} />
          <Route path="storage" element={<PlatformDocumentCentreStorage />} />
          <Route path="config" element={<PlatformDocumentCentreConfig />} />
          <Route path="audit" element={<PlatformDocumentCentreAudit />} />
        </Route>
      </Route>
    </Routes>
  );
}

function GAPageViewTracker() {
  useGAPageViews();
  return null;
}


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <GAPageViewTracker />
        <SubdomainWrapper>
          <AuthProvider>
            <TenantProvider>
              <AppRoutes />
            </TenantProvider>
          </AuthProvider>
        </SubdomainWrapper>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
