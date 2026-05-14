import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TenantSlugProvider } from "@/contexts/TenantSlugContext";

const DEMO_ID = "00000000-0000-0000-0000-000000000demo";
const POSTNET_ID = "00000000-0000-0000-0000-00000postnet";
const APP_ID = "00000000-0000-0000-0000-0000000000app";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/documentCentreApi", () => ({
  setDocumentCentreContext: vi.fn(),
}));

const authState: { user: { id: string } | null; roles: string[] } = {
  user: { id: "user-postnet-member" },
  roles: [],
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

const tenantsBySlug: Record<string, { id: string; app_id: string; name: string; slug: string }> = {
  demo: { id: DEMO_ID, app_id: APP_ID, name: "Demo", slug: "demo" },
  postnet: { id: POSTNET_ID, app_id: APP_ID, name: "PostNet", slug: "postnet" },
};

const membershipsForUser: Record<string, Array<Record<string, unknown>>> = {
  "user-postnet-member": [
    {
      id: "m1",
      app_id: APP_ID,
      tenant_id: POSTNET_ID,
      branch_id: null,
      role: "customer",
      is_active: true,
      can_view_all_orders: false,
    },
  ],
  "user-anon": [],
};

vi.mock("@/integrations/supabase/client", () => {
  const single = (data: unknown) => Promise.resolve({ data, error: null });
  return {
    supabase: {
      from(table: string) {
        const builder: Record<string, unknown> = {};
        const filters: Record<string, unknown> = {};
        const chain = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          },
          maybeSingle: () => {
            if (table === "tenants") {
              const t = tenantsBySlug[filters.slug as string];
              return single(t ?? null);
            }
            return single(null);
          },
          single: () => {
            if (table === "tenants") {
              const t = Object.values(tenantsBySlug).find((x) => x.id === filters.id);
              return single(t ? { name: t.name } : null);
            }
            return single(null);
          },
          then: (resolve: (v: { data: unknown; error: null }) => void) => {
            if (table === "tenant_memberships") {
              const profileId = filters.profile_id as string;
              return resolve({ data: membershipsForUser[profileId] ?? [], error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return chain as unknown as typeof builder;
      },
    },
  };
});

// Import AFTER mocks
import { TenantProvider, useTenantContext } from "@/hooks/useTenantContext";

function Probe() {
  const { tenantId, loading } = useTenantContext();
  if (loading) return <div data-testid="probe">loading</div>;
  return <div data-testid="probe">{tenantId ?? "null"}</div>;
}

function renderAt(path: string, withSubdomainSlug?: string) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <TenantProvider>
        <Probe />
      </TenantProvider>
    </MemoryRouter>
  );
  return render(
    withSubdomainSlug ? (
      <TenantSlugProvider slug={withSubdomainSlug}>{tree}</TenantSlugProvider>
    ) : (
      tree
    )
  );
}

describe("Tenant isolation", () => {
  beforeEach(() => {
    authState.user = { id: "user-postnet-member" };
    authState.roles = [];
  });

  it("on /t/demo/checkout, PostNet member sees demo tenant (URL slug wins)", async () => {
    renderAt("/t/demo/checkout");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe(DEMO_ID));
  });

  it("on /admin, no slug, falls back to membership tenant (PostNet)", async () => {
    renderAt("/admin/orders");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe(POSTNET_ID));
  });

  it("on /t/demo, anonymous user still resolves to demo tenant", async () => {
    authState.user = { id: "user-anon" };
    renderAt("/t/demo/checkout");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe(DEMO_ID));
  });

  it("subdomain slug (no /t/ prefix) resolves to that tenant", async () => {
    renderAt("/checkout", "demo");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe(DEMO_ID));
  });
});
