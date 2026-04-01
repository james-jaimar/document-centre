import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateOrder } from "@/hooks/useOrderBuilder";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, FileText, Layers, Printer } from "lucide-react";
import { toast } from "sonner";

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen,
  FileText,
  Layers,
  Printer,
};

export default function NewOrder() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const createOrder = useCreateOrder();

  const { data: families, isLoading } = useQuery({
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

  const handleSelect = async (familyId: string) => {
    try {
      // Check for existing empty draft for this product family
      if (!user) throw new Error("Not authenticated");
      const { data: existingOrders } = await supabase
        .from("orders")
        .select("id, order_items(id, product_family_id)")
        .eq("user_id", user.id)
        .eq("order_status", "draft")
        .order("created_at", { ascending: false });

      const existingDraft = existingOrders?.find((o: any) =>
        o.order_items?.some((item: any) => item.product_family_id === familyId)
      );

      if (existingDraft) {
        // Check if it has no documents (empty draft)
        const firstItem = (existingDraft as any).order_items?.[0];
        if (firstItem) {
          const { count } = await supabase
            .from("documents")
            .select("id", { count: "exact", head: true })
            .eq("order_item_id", firstItem.id);
          if (count === 0) {
            navigate(`/t/${slug}/orders/${existingDraft.id}/files`);
            return;
          }
        }
      }

      const order = await createOrder.mutateAsync(familyId);
      navigate(`/t/${slug}/orders/${order.id}/files`);
    } catch (err: any) {
      toast.error("Failed to create order", { description: err.message });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">New Order</h1>
        <p className="text-muted-foreground mt-1">
          Choose a product type to get started
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {families?.map((family) => {
            const Icon = ICON_MAP[family.icon ?? ""] ?? FileText;
            return (
              <Card
                key={family.id}
                className="cursor-pointer border-2 border-transparent hover:border-primary/50 hover:shadow-lg transition-all group"
                onClick={() => handleSelect(family.id)}
              >
                <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground text-lg">
                    {family.name}
                  </h3>
                  {family.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {family.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && (!families || families.length === 0) && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No product types available yet.</p>
        </div>
      )}
    </div>
  );
}
