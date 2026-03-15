import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import type { ItemSpec } from "@/lib/calculatePrice";

type Order = Tables<"orders">;
type OrderItem = Tables<"order_items">;
type Document = Tables<"documents">;
type DocumentSection = Tables<"document_sections">;

export interface OrderBuilderState {
  order: Order | null;
  orderItem: OrderItem | null;
  documents: Document[];
  sections: DocumentSection[];
}

export function useOrderData(orderId: string | undefined) {
  const orderQuery = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });

  const orderItemQuery = useQuery({
    queryKey: ["order_item", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });

  const orderItemId = orderItemQuery.data?.id;

  const documentsQuery = useQuery({
    queryKey: ["documents", orderItemId],
    queryFn: async () => {
      if (!orderItemId) return [];
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("order_item_id", orderItemId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!orderItemId,
  });

  const sectionsQuery = useQuery({
    queryKey: ["document_sections", orderItemId],
    queryFn: async () => {
      if (!orderItemId) return [];
      const { data, error } = await supabase
        .from("document_sections")
        .select("*")
        .eq("order_item_id", orderItemId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!orderItemId,
  });

  return {
    order: orderQuery.data ?? null,
    orderItem: orderItemQuery.data ?? null,
    documents: documentsQuery.data ?? [],
    sections: sectionsQuery.data ?? [],
    loading:
      orderQuery.isLoading ||
      orderItemQuery.isLoading ||
      documentsQuery.isLoading ||
      sectionsQuery.isLoading,
    refetchDocuments: documentsQuery.refetch,
    refetchSections: sectionsQuery.refetch,
  };
}

export function useCreateOrder() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (productFamilyId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Get user's tenant_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          tenant_id: profile?.tenant_id ?? null,
          order_status: "draft",
        })
        .select()
        .single();
      if (orderError) throw orderError;

      // Create order item
      const { error: itemError } = await supabase
        .from("order_items")
        .insert({
          order_id: order.id,
          product_family_id: productFamilyId,
          build_status: "draft",
          spec: {
            page_count: 0,
            quantity: 1,
            is_color: true,
            is_duplex: true,
            selected_options: {},
          } satisfies ItemSpec,
        });
      if (itemError) throw itemError;

      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useUpdateOrderItemSpec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, spec }: { id: string; spec: ItemSpec }) => {
      const { data, error } = await supabase
        .from("order_items")
        .update({ spec: spec as unknown as Record<string, unknown> })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["order_item", data.order_id] });
    },
  });
}

export function useAddSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      order_item_id: string;
      document_id: string;
      section_type: "body" | "front_cover" | "back_cover" | "insert" | "tab";
      sort_order: number;
    }) => {
      const { data, error } = await supabase
        .from("document_sections")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["document_sections", data.order_item_id] });
    },
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DocumentSection> & { id: string }) => {
      const { data, error } = await supabase
        .from("document_sections")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["document_sections", data.order_item_id] });
    },
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderItemId }: { id: string; orderItemId: string }) => {
      const { error } = await supabase
        .from("document_sections")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return orderItemId;
    },
    onSuccess: (orderItemId) => {
      qc.invalidateQueries({ queryKey: ["document_sections", orderItemId] });
    },
  });
}
