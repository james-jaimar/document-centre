import { assertEquals, assertMatch, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bookshelfOperation } from "./bookshelf.ts";

const snapshot = {
  product_family_id: "family", product_name: "Wire-bound manuals",
  spec: { page_count: 40, quantity: 1, selected_options: { Paper: "80gsm", Binding: "wire" } },
  documents: [{ id: "source-doc", file_path: "shelf/original.pdf", mime_type: "application/pdf", document_status: "ready" }],
  sections: [{ document_id: "source-doc", section_type: "body", is_duplex: true }],
};
function adminMock(options: { enabled?: boolean; owner?: string; revision?: number } = {}) {
  const rows: Record<string, any> = {
    tenant_memberships: [{ id: "membership" }],
    bookshelf_items: { id: "shelf", profile_id: options.owner ?? "customer", revision: options.revision ?? 2, snapshot },
    product_families: { is_active: true },
    order_items: { id: "item", order_id: "draft", product_family_id: "family", spec: snapshot.spec },
    orders: { id: "draft", user_id: "customer", tenant_id: "tenant", app_id: "app", order_status: "draft", metadata: { bookshelf_item_id: "shelf", bookshelf_revision: 1 } },
  };
  const filters: Record<string, any>[] = [];
  const calls: any[] = [];
  const from = (table: string) => {
    const filter: Record<string, any> = { table }; filters.push(filter);
    const result = () => ({ data: table === "bookshelf_items" && filter.profile_id !== rows[table].profile_id ? null : rows[table], error: null });
    const chain: any = {
      select: () => chain, eq: (key: string, value: any) => { filter[key] = value; return chain; },
      is: () => chain, limit: () => chain, order: () => chain,
      single: () => Promise.resolve(result()), then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  };
  const rpc = (name: string, args: any) => {
    calls.push([name, args]);
    return Promise.resolve({ data: name === "bookshelf_enabled" ? options.enabled !== false : { order_id: "new-draft" }, error: null });
  };
  return { from, rpc, filters, calls };
}
Deno.test("bookshelf restore uses chosen tenant, owner, copies and quantity", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
  try {
    const admin = adminMock();
    const result = await bookshelfOperation(admin, { id: "customer" }, "test-header", { tenant_id: "tenant", operation: "restore", id: "shelf", quantity: 15 });
    assertEquals(result.order_id, "new-draft");
    const call = admin.calls.find(([name]) => name === "commit_bookshelf_operation");
    assertEquals(call[1].p_actor, "customer"); assertEquals(call[1].p_tenant, "tenant"); assertEquals(call[1].p_data.quantity, 15);
    assertEquals(call[1].p_data.expected_revision, 2);
    assertEquals(call[1].p_data.snapshot.spec.selected_options, { Paper: "80gsm", Binding: "wire" });
    assertMatch(call[1].p_data.snapshot.documents[0].file_path, /^order-items\//);
    assertEquals(admin.filters.find(f => f.table === "bookshelf_items")?.profile_id, "customer");
  } finally { globalThis.fetch = originalFetch; }
});
Deno.test("bookshelf rejects another customer's product", async () => {
  const admin = adminMock({ owner: "other-customer" });
  await assertRejects(() => bookshelfOperation(admin, { id: "customer" }, "test-header", { tenant_id: "tenant", operation: "restore", id: "shelf", quantity: 15 }), Error, "not found");
  assertEquals(admin.calls.length, 1);
});
Deno.test("bookshelf rejects an older revision draft", async () => {
  const admin = adminMock({ revision: 2 });
  await assertRejects(() => bookshelfOperation(admin, { id: "customer" }, "test-header", { tenant_id: "tenant", operation: "revise", id: "shelf", order_item_id: "item", name: "Manual" }), Error, "fresh copy");
  assertEquals(admin.calls.length, 1);
});
Deno.test("bookshelf refuses orders after tenant disables the feature", async () => {
  const admin = adminMock({ enabled: false });
  await assertRejects(() => bookshelfOperation(admin, { id: "customer" }, "test-header", { tenant_id: "tenant", operation: "restore", id: "shelf", quantity: 15 }), Error, "not enabled");
  assertEquals(admin.filters.length, 1);
});