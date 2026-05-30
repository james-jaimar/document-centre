import { useQuery } from "@tanstack/react-query";
import { fetchAdminOrders, fetchCustomerOrders, fetchOrderDetail } from "@/lib/orders/queries";
import type { AdminOrderListFilters, ClientOrderListFilters } from "@/lib/orders/types";

export function useAdminOrders(filters: AdminOrderListFilters = {}) {
  return useQuery({
    queryKey: ["admin-orders", filters],
    queryFn: () => fetchAdminOrders(filters),
    staleTime: 15_000,
    gcTime: 60_000,
  });
}

export function useCustomerOrders(filters: ClientOrderListFilters = {}) {
  return useQuery({
    queryKey: ["customer-orders", filters],
    queryFn: () => fetchCustomerOrders(filters),
    staleTime: 15_000,
    gcTime: 60_000,
  });
}

export function useOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: () => fetchOrderDetail(orderId!),
    enabled: !!orderId,
  });
}
