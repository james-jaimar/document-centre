import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import StorefrontLanding from "@/pages/storefront/StorefrontLanding";

/**
 * Renders the public storefront landing for guests.
 * Authenticated users are redirected to the print-centre dashboard.
 */
export default function PublicStorefront() {
  const { slug } = useParams<{ slug: string }>();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={`/t/${slug}/print-centre`} replace />;
  }

  return <StorefrontLanding />;
}
