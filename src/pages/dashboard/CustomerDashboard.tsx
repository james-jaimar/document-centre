import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateOrder } from "@/hooks/useOrderBuilder";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  FileText,
  ArrowRight,
  Package,
  Truck,
  Clock,
  CheckCircle2,
  BookOpen,
  FileStack,
  Presentation,
  Printer,
  UploadCloud,
  FolderOpen,
  FileImage,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useCallback, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import imgBoundDocuments from "@/assets/products/bound-documents.jpg";
import imgPresentations from "@/assets/products/presentations.jpg";
import imgRingBinders from "@/assets/products/ring-binders.jpg";
import imgStapledLoose from "@/assets/products/stapled-loose.jpg";
import imgPosters from "@/assets/products/posters.jpg";
import imgBooklets from "@/assets/products/booklets.jpg";
import imgFlyers from "@/assets/products/flyers.jpg";
import imgBrochures from "@/assets/products/brochures.jpg";

const SLUG_IMAGE_MAP: Record<string, string> = {
  "bound-documents": imgBoundDocuments,
  presentations: imgPresentations,
  "ring-binders": imgRingBinders,
  "stapled-loose-pages": imgStapledLoose,
  posters: imgPosters,
  booklets: imgBooklets,
  flyers: imgFlyers,
  brochures: imgBrochures,
};

/* ── Icon map ── */
const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen,
  FileStack,
  Presentation,
  Printer,
  Package,
  FolderOpen,
  FileImage,
  FileText,
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  quoted: "secondary",
  confirmed: "default",
  in_production: "default",
  quality_check: "default",
  ready_for_collection: "default",
  dispatched: "default",
  delivered: "secondary",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  quoted: "Quoted",
  confirmed: "Confirmed",
  in_production: "Printing",
  quality_check: "QC",
  ready_for_collection: "Ready",
  dispatched: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/* ── Queries ── */
function useProductFamiliesActive() {
  return useQuery({
    queryKey: ["product_families_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useRecentDocuments(userId: string | undefined, tenantId: string | null) {
  return useQuery({
    queryKey: ["recent_documents", userId, tenantId],
    queryFn: async () => {
      if (!userId || !tenantId) return [];
      const { data, error } = await supabase
        .from("documents")
        .select("*, order_items!inner(id, orders!inner(user_id, tenant_id))")
        .eq("order_items.orders.user_id", userId)
        .eq("order_items.orders.tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!tenantId,
  });
}

function useRecentOrderItems(userId: string | undefined, tenantId: string | null) {
  return useQuery({
    queryKey: ["recent_order_items", userId, tenantId],
    queryFn: async () => {
      if (!userId || !tenantId) return [];
      const { data, error } = await supabase
        .from("order_items")
        .select("id, title, updated_at, order_id, build_status, orders!inner(user_id, order_status, tenant_id)")
        .eq("orders.user_id", userId)
        .eq("orders.tenant_id", tenantId)
        .in("orders.order_status", ["draft", "quoted"])
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!tenantId,
  });
}

function useTrackingOrders(userId: string | undefined, tenantId: string | null) {
  return useQuery({
    queryKey: ["tracking_orders", userId, tenantId],
    queryFn: async () => {
      if (!userId || !tenantId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .in("order_status", [
          "confirmed",
          "in_production",
          "quality_check",
          "ready_for_collection",
          "dispatched",
        ])
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!tenantId,
  });
}

/* ── Helpers ── */
function getOrderDisplayName(order: any): string {
  const items = order.order_items as any[] | undefined;
  if (items?.length) {
    // Try first document filename
    const docs = items[0]?.documents as any[] | undefined;
    if (docs?.length && docs[0]?.file_name) {
      return docs[0].file_name;
    }
    // Fall back to item title
    if (items[0]?.title) return items[0].title;
  }
  return `Order ${order.id.slice(0, 8)}`;
}

/* ── Component ── */
const CustomerDashboard = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const createOrder = useCreateOrder();
  const { data: families, isLoading: familiesLoading } = useProductFamiliesActive();
  const { data: recentDocs } = useRecentDocuments(user?.id, tenantId);
  const { data: trackingOrders } = useTrackingOrders(user?.id, tenantId);
  const { data: recentItems } = useRecentOrderItems(user?.id, tenantId);
  const [creatingFamily, setCreatingFamily] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handlePickProduct = async (familyId: string) => {
    setCreatingFamily(familyId);
    try {
      const order = await createOrder.mutateAsync(familyId);
      navigate(`/t/${slug}/orders/${order.id}/files`);
    } finally {
      setCreatingFamily(null);
    }
  };

  const handleUploadClick = useCallback(() => {
    navigate(`/t/${slug}/orders/new`);
  }, [navigate, slug]);

  return (
    <div className="space-y-8">
      {/* ── Product Picker ── */}
      <div className="glass-card overflow-hidden">
        <div className="border-b border-border bg-gradient-to-r from-secondary/90 to-secondary/40 px-6 py-5">
          <h2 className="text-center text-xl font-semibold tracking-tight text-foreground">
            Get started by choosing a product
          </h2>
        </div>
        <div className="overflow-x-auto px-5 py-6">
          <div className="flex gap-4">
            {familiesLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-[150px] shrink-0 rounded-3xl" />
                ))
              : families?.map((f) => {
                  const Icon = ICON_MAP[f.icon ?? ""] ?? Package;
                  return (
                    <button
                      key={f.id}
                      className="product-tile"
                      onClick={() => handlePickProduct(f.id)}
                      disabled={creatingFamily === f.id}
                    >
                      <div className="product-thumb overflow-hidden">
                        {creatingFamily === f.id ? (
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        ) : (SLUG_IMAGE_MAP[f.slug] || f.image_url) ? (
                          <img src={SLUG_IMAGE_MAP[f.slug] || f.image_url!} alt={f.name} className="h-full w-full object-cover" />
                        ) : (
                          <Icon className="h-9 w-9 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-center text-base font-medium text-foreground">
                        {f.name}
                      </span>
                    </button>
                  );
                })}
          </div>
        </div>
      </div>

      {/* ── Full-width Upload Zone ── */}
      <div>
        <h1 className="mb-4 text-4xl font-semibold tracking-tight text-foreground">
          Get started by uploading PDFs
        </h1>
        <div
          className={`upload-dropzone section-card ${dragOver ? "border-primary bg-white" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            navigate(`/t/${slug}/orders/new`);
          }}
          onClick={handleUploadClick}
        >
          <UploadCloud className="mb-4 h-14 w-14 text-muted-foreground/40" />
          <p className="text-2xl font-medium tracking-tight text-muted-foreground">
            Drag and drop files here, or{" "}
            <span className="text-primary">browse</span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground/70">
            PDF, Word, PowerPoint and image files supported
          </p>
        </div>
      </div>

      {/* ── 2×2 Data Grid ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Recently Uploaded Files */}
        <div className="section-card overflow-hidden">
          <div className="section-header">Recently Uploaded Files</div>
          {!recentDocs?.length ? (
            <div className="status-empty">No uploads yet</div>
          ) : (
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Options</th>
                </tr>
              </thead>
              <tbody>
                {recentDocs.slice(0, 4).map((doc) => (
                  <tr key={doc.id}>
                    <td className="max-w-[180px] truncate" title={doc.file_name}>
                      {doc.file_name}
                    </td>
                    <td className="text-muted-foreground">
                      {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                    </td>
                    <td>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="soft-button soft-button-gold">
                            Create
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-56 p-2">
                          <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Choose a product</p>
                          <div className="grid gap-1">
                            {families?.map((f) => {
                              const Icon = ICON_MAP[f.icon ?? ""] ?? Package;
                              return (
                                <button
                                  key={f.id}
                                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-secondary transition-colors text-left"
                                  onClick={() => navigate(`/t/${slug}/orders/new/${f.id}?fromDoc=${doc.id}`)}
                                >
                                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                  {f.name}
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recently Modified */}
        <div className="section-card overflow-hidden">
          <div className="section-header">Recently Modified</div>
          {!recentItems?.length ? (
            <div className="status-empty">No recent items</div>
          ) : (
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Modified</th>
                  <th>Options</th>
                </tr>
              </thead>
              <tbody>
                {recentItems.slice(0, 3).map((item) => (
                  <tr key={item.id}>
                    <td className="max-w-[160px] truncate" title={item.title || `Item ${item.id.slice(0, 8)}`}>
                      {item.title || `Item ${item.id.slice(0, 8)}`}
                    </td>
                    <td className="text-muted-foreground">
                      {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                    </td>
                    <td>
                      <button
                        className="soft-button soft-button-primary"
                        onClick={() => {
                          const status = item.build_status;
                          const path = status === "draft" || status === "building"
                            ? `/t/${slug}/orders/${item.order_id}/files`
                            : `/t/${slug}/orders/${item.order_id}/build`;
                          navigate(path);
                        }}
                      >
                        Continue
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Frequently Ordered */}
        <div className="section-card overflow-hidden">
          <div className="section-header">Frequently Ordered</div>
          {!recentDocs?.length ? (
            <div className="status-empty">No items yet</div>
          ) : (
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Options</th>
                </tr>
              </thead>
              <tbody>
                {recentDocs.slice(0, 4).map((doc) => (
                  <tr key={doc.id}>
                    <td className="max-w-[180px] truncate" title={doc.file_name}>
                      {doc.file_name}
                    </td>
                    <td>
                      <button
                        className="soft-button soft-button-gold"
                        onClick={() => navigate(`/t/${slug}/orders/new?fromDoc=${doc.id}`)}
                      >
                        Reorder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Order Tracking */}
        <div className="section-card overflow-hidden">
          <div className="section-header">
            <span className="flex items-center gap-2">
              <Truck className="h-4 w-4" /> Order Tracking
            </span>
          </div>
          {!trackingOrders?.length ? (
            <div className="status-empty">No items to display</div>
          ) : (
            <div className="divide-y divide-secondary">
              {trackingOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/t/${slug}/orders/${order.id}`)}
                >
                  <div className="flex items-center gap-3">
                    {order.order_status === "dispatched" ? (
                      <Truck className="h-4 w-4 text-primary" />
                    ) : order.order_status === "ready_for_collection" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Clock className="h-4 w-4 text-warning" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Order {order.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated{" "}
                        {formatDistanceToNow(new Date(order.updated_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[order.order_status] ?? "outline"}>
                    {STATUS_LABEL[order.order_status] ?? order.order_status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;
