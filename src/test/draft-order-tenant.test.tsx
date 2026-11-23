import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCreateOrder } from "@/hooks/useOrderBuilder";

const DEMO_ID = "00000000-0000-0000-0000-000000000demo";
const POSTNET_ID = "00000000-0000-0000-0000-00000postnet";
const APP_ID = "00000000-0000-0000-0000-0000000000app";

// User's memberships: PostNet first, Demo second. An unscoped `.limit(1)`
// lookup would return PostNet — the bug this test guards against.
const memberships = [
  { tenant_id: POSTNET_ID, app_id: APP_ID, is_active: true },
  { tenant_id: DEMO_ID, app_id: APP_ID, is_active: true },
];

let insertedOrder: Record<string, unknown> | null = null;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-multi-tenant" }, roles: [] }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const single = (data: unknown) => Promise.resolve({ data, error: null });
  return {
    supabase: {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          },
          limit: () => chain,
          maybeSingle: () => {
            if (table === "tenants") {
              return single(filters.slug === "demo" ? { id: DEMO_ID } : null);
            }
            if (table === "tenant_memberships") {
              const scoped = memberships.filter(
                (m) =>
                  m.is_active &&
                  (filters.tenant_id === undefined || m.tenant_id === filters.tenant_id),
              );
              return single(scoped[0] ?? null);
            }
            return single(null);
          },
          single: () => {
            if (table === "orders") return single({ id: "order-1", ...insertedOrder });
            return single(null);
          },
          insert: (payload: Record<string, unknown>) => {
            if (table === "orders") insertedOrder = payload;
            return table === "orders" ? chain : Promise.resolve({ error: null });
          },
        };
        return chain;
      },
    },
  };
});

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useCreateOrder tenant stamping", () => {
  it("stamps the draft with the storefront tenant from the URL, not the user's first membership", async () => {
    insertedOrder = null;
    // The hook reads the storefront slug from window.location.pathname.
    window.history.pushState({}, "", "/t/demo/build/family-1");
    const { result } = renderHook(() => useCreateOrder(), { wrapper: Wrapper });

    result.current.mutate("family-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(insertedOrder?.tenant_id).toBe(DEMO_ID);
    expect(insertedOrder?.app_id).toBe(APP_ID);
  });
});
