// Branch pricing round-trip: export as .xlsx, preview diff, apply, undo.
// Actions (query param `action`):
//   export  GET  -> streams a .xlsx of every priced surface for the branch
//   preview POST multipart -> parses uploaded xlsx, returns diff JSON
//   apply   POST JSON { branch_id, filename, changes } -> writes + snapshots, returns { snapshot_id, applied }
//   undo    POST JSON { snapshot_id } -> reverts a snapshot
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface UserContext {
  userId: string;
  userClient: ReturnType<typeof createClient>;
  admin: ReturnType<typeof createClient>;
}

async function getUser(req: Request): Promise<UserContext | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const client = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return {
    userId: data.user.id,
    userClient: client,
    admin: createClient(SUPABASE_URL, SERVICE_KEY),
  };
}

async function assertBranchAccess(admin: any, userClient: any, userId: string, branchId: string) {
  const { data, error } = await userClient.rpc("user_can_manage_branch", { p_branch_id: branchId });
  if (!error && data === true) return;
  console.warn("branch-pricing-workbook access check fell back", {
    branchId,
    rpcFailed: !!error,
    rpcMessage: error?.message ?? null,
    rpcAllowed: data === true,
  });
  // Fallback: check membership directly for manager-level roles.
  const { data: mem, error: memError } = await admin
    .from("tenant_memberships")
    .select("role,branch_id,is_active")
    .eq("profile_id", userId)
    .eq("is_active", true);
  if (memError) {
    console.warn("branch-pricing-workbook membership fallback failed", {
      branchId,
      message: memError.message,
    });
  }
  const ok = (mem ?? []).some(
    (m: any) =>
      (m.role === "owner" || m.role === "admin" || m.role === "branch_manager" || m.role === "store_operator") &&
      (m.branch_id === null || m.branch_id === branchId),
  );
  if (!ok) throw new Error("Not authorised for this branch");
}

// ---------- Tab definitions ----------
// Each tab: (a) fetch rows from DB scoped to branch, (b) render as sheet, (c) apply changes back.
// row_key format: `<tab>:<row_id>` (or composite for jsonb inner rows).

type TabDef = {
  name: string; // sheet name
  headers: string[]; // column labels
  hidden: number[]; // 0-based indexes of columns to hide
  colWidths: number[]; // widths per column
  fetch: (admin: any, branchId: string, tenantId: string) => Promise<any[][]>;
  // Returns the list of row-keys → { sell, cost } we can update
  applyRow: (
    admin: any,
    rowKey: string,
    sellPrice: number,
    costPrice: number,
    branchId: string,
    tenantId: string,
  ) => Promise<{ before: { sell: number; cost: number }; label: string }>;
};

const MONEY = "R#,##0.00;(R#,##0.00);-";

function toMinor(n: number) {
  return Math.round(Number(n) * 100);
}
function fromMinor(n: number | null | undefined) {
  return n == null ? 0 : Number(n) / 100;
}

const TABS: TabDef[] = [
  {
    name: "Paper prices",
    headers: ["row_key", "Size", "Paper", "GSM", "Sell (ex VAT)", "Cost (ex VAT)"],
    hidden: [0],
    colWidths: [30, 12, 32, 8, 16, 16],
    fetch: async (admin, branchId) => {
      const { data: prices } = await admin
        .from("catalog_paper_prices")
        .select("id, paper_id, size_code, sell_price_minor, cost_price_minor")
        .eq("scope_type", "branch")
        .eq("branch_id", branchId)
        .eq("is_active", true);
      const paperIds = [...new Set((prices ?? []).map((p: any) => p.paper_id))];
      const { data: papers } = await admin
        .from("catalog_papers")
        .select("id, label, weight_gsm")
        .in("id", paperIds.length ? paperIds : ["00000000-0000-0000-0000-000000000000"]);
      const paperMap = new Map((papers ?? []).map((p: any) => [p.id, p]));
      return (prices ?? [])
        .map((p: any) => {
          const paper = paperMap.get(p.paper_id);
          return [
            `paper_price:${p.id}`,
            (p.size_code ?? "").toUpperCase(),
            paper?.label ?? "?",
            paper?.weight_gsm ?? "",
            fromMinor(p.sell_price_minor),
            fromMinor(p.cost_price_minor),
          ];
        })
        .sort((a: any[], b: any[]) => `${a[2]}${a[1]}`.localeCompare(`${b[2]}${b[1]}`));
    },
    applyRow: async (admin, rowKey, sell, cost) => {
      const id = rowKey.split(":")[1];
      const { data: cur } = await admin
        .from("catalog_paper_prices")
        .select("id, sell_price_minor, cost_price_minor, size_code, paper_id")
        .eq("id", id)
        .single();
      const before = { sell: fromMinor(cur.sell_price_minor), cost: fromMinor(cur.cost_price_minor) };
      await admin
        .from("catalog_paper_prices")
        .update({ sell_price_minor: toMinor(sell), cost_price_minor: toMinor(cost) })
        .eq("id", id);
      return { before, label: `Paper price ${cur.size_code}` };
    },
  },
  {
    name: "Finishing prices",
    headers: ["row_key", "Finishing", "Category", "Basis", "Size", "Sell (ex VAT)", "Cost (ex VAT)"],
    hidden: [0],
    colWidths: [30, 30, 14, 14, 10, 16, 16],
    fetch: async (admin, branchId) => {
      const { data: prices } = await admin
        .from("catalog_finishing_prices")
        .select("id, finishing_id, size_code, sell_price_minor, cost_price_minor")
        .eq("scope_type", "branch")
        .eq("branch_id", branchId)
        .eq("is_active", true);
      const fIds = [...new Set((prices ?? []).map((p: any) => p.finishing_id))];
      const { data: fins } = await admin
        .from("catalog_finishing")
        .select("id, label, category, pricing_basis")
        .in("id", fIds.length ? fIds : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((fins ?? []).map((f: any) => [f.id, f]));
      return (prices ?? [])
        .map((p: any) => {
          const f = map.get(p.finishing_id);
          return [
            `finishing_price:${p.id}`,
            f?.label ?? "?",
            f?.category ?? "",
            f?.pricing_basis ?? "",
            (p.size_code ?? "").toUpperCase(),
            fromMinor(p.sell_price_minor),
            fromMinor(p.cost_price_minor),
          ];
        })
        .sort((a: any[], b: any[]) => `${a[1]}${a[4]}`.localeCompare(`${b[1]}${b[4]}`));
    },
    applyRow: async (admin, rowKey, sell, cost) => {
      const id = rowKey.split(":")[1];
      const { data: cur } = await admin
        .from("catalog_finishing_prices")
        .select("id, sell_price_minor, cost_price_minor, size_code")
        .eq("id", id)
        .single();
      const before = { sell: fromMinor(cur.sell_price_minor), cost: fromMinor(cur.cost_price_minor) };
      await admin
        .from("catalog_finishing_prices")
        .update({ sell_price_minor: toMinor(sell), cost_price_minor: toMinor(cost) })
        .eq("id", id);
      return { before, label: `Finishing ${cur.size_code}` };
    },
  },
  {
    name: "Click charges",
    headers: ["row_key", "Size", "Colour", "Sides", "Variant", "Sell (ex VAT)", "Cost (ex VAT)"],
    hidden: [0],
    colWidths: [30, 10, 10, 12, 14, 16, 16],
    fetch: async (admin, branchId) => {
      const { data } = await admin
        .from("rate_card_clicks")
        .select("id, size, colour, sides, variant_code, sell_price, cost_price, catalog_size_code")
        .eq("scope_type", "branch")
        .eq("branch_id", branchId)
        .eq("is_active", true);
      return (data ?? [])
        .map((r: any) => [
          `click:${r.id}`,
          (r.catalog_size_code ?? r.size ?? "").toUpperCase(),
          r.colour,
          r.sides,
          r.variant_code ?? "",
          Number(r.sell_price ?? 0),
          Number(r.cost_price ?? 0),
        ])
        .sort((a: any[], b: any[]) =>
          `${a[1]}${a[2]}${a[3]}${a[4]}`.localeCompare(`${b[1]}${b[2]}${b[3]}${b[4]}`),
        );
    },
    applyRow: async (admin, rowKey, sell, cost) => {
      const id = rowKey.split(":")[1];
      const { data: cur } = await admin
        .from("rate_card_clicks")
        .select("id, sell_price, cost_price, catalog_size_code, colour, sides")
        .eq("id", id)
        .single();
      const before = { sell: Number(cur.sell_price ?? 0), cost: Number(cur.cost_price ?? 0) };
      await admin.from("rate_card_clicks").update({ sell_price: sell, cost_price: cost }).eq("id", id);
      return {
        before,
        label: `Click ${cur.catalog_size_code} ${cur.colour} ${cur.sides}`,
      };
    },
  },
  {
    name: "Photo prints",
    headers: ["row_key", "Code", "Label", "Size", "Finish", "Sell (ex VAT)", "Cost (ex VAT)"],
    hidden: [0],
    colWidths: [30, 12, 30, 14, 14, 16, 16],
    fetch: async (admin, branchId) => {
      const { data } = await admin
        .from("rate_card_photo_prints")
        .select("id, code, label, size_slug, finish, sell_price, cost_price")
        .eq("scope_type", "branch")
        .eq("branch_id", branchId)
        .eq("is_active", true);
      return (data ?? [])
        .map((r: any) => [
          `photo:${r.id}`,
          r.code ?? "",
          r.label ?? "",
          r.size_slug ?? "",
          r.finish ?? "",
          Number(r.sell_price ?? 0),
          Number(r.cost_price ?? 0),
        ])
        .sort((a: any[], b: any[]) => `${a[2]}`.localeCompare(`${b[2]}`));
    },
    applyRow: async (admin, rowKey, sell, cost) => {
      const id = rowKey.split(":")[1];
      const { data: cur } = await admin
        .from("rate_card_photo_prints")
        .select("id, label, sell_price, cost_price")
        .eq("id", id)
        .single();
      const before = { sell: Number(cur.sell_price ?? 0), cost: Number(cur.cost_price ?? 0) };
      await admin
        .from("rate_card_photo_prints")
        .update({ sell_price: sell, cost_price: cost })
        .eq("id", id);
      return { before, label: `Photo ${cur.label}` };
    },
  },
  {
    name: "Business cards",
    headers: [
      "row_key",
      "Code",
      "Label",
      "Quantity",
      "Sides",
      "Paper",
      "Finish",
      "Sell (ex VAT)",
      "Cost (ex VAT)",
    ],
    hidden: [0],
    colWidths: [30, 12, 30, 10, 10, 20, 16, 16, 16],
    fetch: async (admin, branchId) => {
      const { data } = await admin
        .from("rate_card_business_cards")
        .select("id, code, label, quantity, sides, paper, finish, sell_price, cost_price")
        .eq("scope_type", "branch")
        .eq("branch_id", branchId)
        .eq("is_active", true);
      return (data ?? [])
        .map((r: any) => [
          `bcard:${r.id}`,
          r.code ?? "",
          r.label ?? "",
          r.quantity ?? 0,
          r.sides ?? "",
          r.paper ?? "",
          r.finish ?? "",
          Number(r.sell_price ?? 0),
          Number(r.cost_price ?? 0),
        ])
        .sort((a: any[], b: any[]) => `${a[2]}${a[3]}`.localeCompare(`${b[2]}${b[3]}`));
    },
    applyRow: async (admin, rowKey, sell, cost) => {
      const id = rowKey.split(":")[1];
      const { data: cur } = await admin
        .from("rate_card_business_cards")
        .select("id, label, quantity, sell_price, cost_price")
        .eq("id", id)
        .single();
      const before = { sell: Number(cur.sell_price ?? 0), cost: Number(cur.cost_price ?? 0) };
      await admin
        .from("rate_card_business_cards")
        .update({ sell_price: sell, cost_price: cost })
        .eq("id", id);
      return { before, label: `Business card ${cur.label} × ${cur.quantity}` };
    },
  },
  {
    name: "Quantity breaks",
    headers: [
      "row_key",
      "Rate card",
      "Item",
      "Min qty",
      "Max qty",
      "Sell (ex VAT)",
      "Cost (ex VAT)",
    ],
    hidden: [0],
    colWidths: [40, 16, 28, 10, 10, 16, 16],
    fetch: async (admin, branchId) => {
      const { data } = await admin
        .from("rate_card_price_breaks")
        .select("id, rate_card_table, rate_card_id, min_quantity, max_quantity, sell_price, cost_price")
        .eq("scope_type", "branch")
        .eq("branch_id", branchId);
      // Resolve parent labels
      const byTable: Record<string, string[]> = {};
      for (const r of data ?? []) {
        (byTable[r.rate_card_table] ??= []).push(r.rate_card_id);
      }
      const labelMap = new Map<string, string>();
      for (const [tbl, ids] of Object.entries(byTable)) {
        const { data: parents } = await admin
          .from(tbl)
          .select("id, label")
          .in("id", [...new Set(ids)]);
        for (const p of parents ?? []) labelMap.set(`${tbl}:${p.id}`, p.label ?? "?");
      }
      return (data ?? [])
        .map((r: any) => [
          `break:${r.id}`,
          r.rate_card_table.replace("rate_card_", ""),
          labelMap.get(`${r.rate_card_table}:${r.rate_card_id}`) ?? "?",
          r.min_quantity ?? 0,
          r.max_quantity ?? "",
          Number(r.sell_price ?? 0),
          Number(r.cost_price ?? 0),
        ])
        .sort((a: any[], b: any[]) => `${a[2]}${a[3]}`.localeCompare(`${b[2]}${b[3]}`));
    },
    applyRow: async (admin, rowKey, sell, cost) => {
      const id = rowKey.split(":")[1];
      const { data: cur } = await admin
        .from("rate_card_price_breaks")
        .select("id, min_quantity, sell_price, cost_price")
        .eq("id", id)
        .single();
      const before = { sell: Number(cur.sell_price ?? 0), cost: Number(cur.cost_price ?? 0) };
      await admin
        .from("rate_card_price_breaks")
        .update({ sell_price: sell, cost_price: cost })
        .eq("id", id);
      return { before, label: `Break from ${cur.min_quantity}` };
    },
  },
  {
    name: "Pack pricing",
    headers: [
      "row_key",
      "Product",
      "Size",
      "Paper",
      "Sides",
      "Variant",
      "Quantity",
      "Sell (ex VAT)",
      "Cost (ex VAT)",
    ],
    hidden: [0],
    colWidths: [45, 24, 10, 24, 10, 14, 10, 16, 16],
    fetch: async (admin, branchId, tenantId) => {
      const { data: overrides } = await admin
        .from("product_pack_pricing_overrides")
        .select("id, product_family_id, variant_code, quantity_blocks")
        .eq("branch_id", branchId)
        .eq("tenant_id", tenantId);
      const famIds = [...new Set((overrides ?? []).map((o: any) => o.product_family_id))];
      const { data: fams } = await admin
        .from("product_families")
        .select("id, name")
        .in("id", famIds.length ? famIds : ["00000000-0000-0000-0000-000000000000"]);
      const famMap = new Map((fams ?? []).map((f: any) => [f.id, f.name]));
      const rows: any[][] = [];
      for (const o of overrides ?? []) {
        const blocks = Array.isArray(o.quantity_blocks) ? o.quantity_blocks : [];
        blocks.forEach((b: any, idx: number) => {
          rows.push([
            `pack:${o.id}:${idx}`,
            famMap.get(o.product_family_id) ?? "?",
            (b.size ?? "").toUpperCase(),
            b.paper ?? "",
            b.sides ?? "",
            o.variant_code ?? "",
            Number(b.quantity ?? 0),
            Number(b.sell_price ?? 0),
            Number(b.cost_price ?? 0),
          ]);
        });
      }
      return rows.sort((a, b) =>
        `${a[1]}${a[2]}${a[3]}${a[4]}${String(a[6]).padStart(8, "0")}`.localeCompare(
          `${b[1]}${b[2]}${b[3]}${b[4]}${String(b[6]).padStart(8, "0")}`,
        ),
      );
    },
    applyRow: async (admin, rowKey, sell, cost) => {
      const [, id, idxStr] = rowKey.split(":");
      const idx = Number(idxStr);
      const { data: cur } = await admin
        .from("product_pack_pricing_overrides")
        .select("id, quantity_blocks")
        .eq("id", id)
        .single();
      const blocks = Array.isArray(cur.quantity_blocks) ? [...cur.quantity_blocks] : [];
      const block = blocks[idx] ?? {};
      const before = { sell: Number(block.sell_price ?? 0), cost: Number(block.cost_price ?? 0) };
      blocks[idx] = { ...block, sell_price: sell, cost_price: cost };
      await admin.from("product_pack_pricing_overrides").update({ quantity_blocks: blocks }).eq("id", id);
      return { before, label: `Pack ${block.size ?? ""} × ${block.quantity ?? ""}` };
    },
  },
  {
    name: "Variant overrides",
    headers: [
      "row_key",
      "Product",
      "Conditions",
      "Qty min",
      "Qty max",
      "Sell (ex VAT)",
      "Cost (ex VAT)",
    ],
    hidden: [0],
    colWidths: [40, 24, 40, 10, 10, 16, 16],
    fetch: async (admin, branchId, tenantId) => {
      const { data: rows } = await admin
        .from("product_price_overrides")
        .select("id, product_family_id, conditions, quantity_min, quantity_max, sell_price, cost_price")
        .eq("branch_id", branchId)
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      const famIds = [...new Set((rows ?? []).map((r: any) => r.product_family_id))];
      const { data: fams } = await admin
        .from("product_families")
        .select("id, name")
        .in("id", famIds.length ? famIds : ["00000000-0000-0000-0000-000000000000"]);
      const famMap = new Map((fams ?? []).map((f: any) => [f.id, f.name]));
      return (rows ?? [])
        .map((r: any) => [
          `variant:${r.id}`,
          famMap.get(r.product_family_id) ?? "?",
          Object.entries(r.conditions ?? {})
            .map(([k, v]) => `${k}=${v}`)
            .join(", "),
          r.quantity_min ?? 0,
          r.quantity_max ?? "",
          Number(r.sell_price ?? 0),
          Number(r.cost_price ?? 0),
        ])
        .sort((a: any[], b: any[]) => `${a[1]}${a[2]}${a[3]}`.localeCompare(`${b[1]}${b[2]}${b[3]}`));
    },
    applyRow: async (admin, rowKey, sell, cost) => {
      const id = rowKey.split(":")[1];
      const { data: cur } = await admin
        .from("product_price_overrides")
        .select("id, conditions, quantity_min, sell_price, cost_price")
        .eq("id", id)
        .single();
      const before = { sell: Number(cur.sell_price ?? 0), cost: Number(cur.cost_price ?? 0) };
      await admin
        .from("product_price_overrides")
        .update({ sell_price: sell, cost_price: cost })
        .eq("id", id);
      return {
        before,
        label: `Variant override from qty ${cur.quantity_min}`,
      };
    },
  },
];

function findTab(name: string) {
  return TABS.find((t) => t.name === name);
}

// ---------- EXPORT ----------
async function handleExport(admin: any, branchId: string) {
  const { data: branch } = await admin
    .from("branches")
    .select("id, name, slug, url_slug, tenant_id, trading_name")
    .eq("id", branchId)
    .single();
  if (!branch) throw new Error("Branch not found");

  // Belt-and-braces seeding
  await admin.rpc("ensure_branch_pricing_seeded", { _branch_id: branchId });

  const wb = XLSX.utils.book_new();

  // Read-me sheet
  const readme = [
    [`${branch.trading_name ?? branch.name} — Pricing`],
    [`Generated ${new Date().toISOString().slice(0, 10)}`],
    [],
    ["How to use this workbook"],
    ["1. Only edit the two right-hand columns: Sell (ex VAT) and Cost (ex VAT)."],
    ["2. Prices are in Rand, excluding VAT."],
    ["3. Do not add, delete, rename or reorder rows or tabs."],
    ["4. Do not touch the hidden row_key column — it links each row back to your pricing system."],
    ["5. Save the file, then upload it back on the Pricing page and review the diff before applying."],
    [],
    ["Every change you apply can be undone in one click for 24 hours."],
  ];
  const readmeWs = XLSX.utils.aoa_to_sheet(readme);
  readmeWs["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, readmeWs, "Read me");

  for (const tab of TABS) {
    const rows = await tab.fetch(admin, branchId, branch.tenant_id);
    const aoa = [tab.headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = tab.colWidths.map((wch, i) => ({
      wch,
      hidden: tab.hidden.includes(i) ? true : undefined,
    }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
    // Number-format money columns (last two)
    const money = [tab.headers.length - 2, tab.headers.length - 1];
    for (let r = 1; r < aoa.length; r++) {
      for (const c of money) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (ws[addr]) (ws[addr] as any).z = MONEY;
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, tab.name);
  }

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const slug = branch.url_slug ?? branch.slug ?? "branch";
  const filename = `${slug}-pricing-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf, {
    headers: {
      ...corsHeaders,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ---------- PREVIEW (parse + diff) ----------
interface DiffRow {
  tab: string;
  rowKey: string;
  label: string;
  sellBefore: number;
  sellAfter: number;
  costBefore: number;
  costAfter: number;
}

async function parseWorkbookForBranch(
  admin: any,
  branchId: string,
  tenantId: string,
  bytes: Uint8Array,
) {
  const wb = XLSX.read(bytes, { type: "array" });
  const changes: DiffRow[] = [];
  for (const tab of TABS) {
    const ws = wb.Sheets[tab.name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
    if (rows.length < 2) continue;
    const header = rows[0].map((h: any) => String(h ?? "").trim());
    const rowKeyIdx = header.indexOf("row_key");
    const sellIdx = header.findIndex((h) => /^Sell/i.test(String(h)));
    const costIdx = header.findIndex((h) => /^Cost/i.test(String(h)));
    if (rowKeyIdx < 0 || sellIdx < 0 || costIdx < 0) continue;

    // Load current DB state for this tab once
    const current = await tab.fetch(admin, branchId, tenantId);
    const curMap = new Map<string, { sell: number; cost: number; label: string }>();
    for (const cr of current) {
      curMap.set(String(cr[0]), {
        sell: Number(cr[cr.length - 2] ?? 0),
        cost: Number(cr[cr.length - 1] ?? 0),
        // human-ish label = first non-key column value
        label: String(cr[1] ?? cr[0]),
      });
    }

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rowKey = String(r[rowKeyIdx] ?? "").trim();
      if (!rowKey) continue;
      const sellRaw = r[sellIdx];
      const costRaw = r[costIdx];
      if (sellRaw == null && costRaw == null) continue;
      const sellAfter = Number(sellRaw ?? 0);
      const costAfter = Number(costRaw ?? 0);
      if (!Number.isFinite(sellAfter) || sellAfter < 0) continue;
      if (!Number.isFinite(costAfter) || costAfter < 0) continue;
      const cur = curMap.get(rowKey);
      if (!cur) continue;
      const changed =
        Math.abs(sellAfter - cur.sell) > 0.001 || Math.abs(costAfter - cur.cost) > 0.001;
      if (!changed) continue;
      // Build a nicer label from all non-key, non-money columns
      const labelParts: string[] = [];
      for (let c = 0; c < header.length; c++) {
        if (c === rowKeyIdx || c === sellIdx || c === costIdx) continue;
        if (r[c] != null && r[c] !== "") labelParts.push(String(r[c]));
      }
      changes.push({
        tab: tab.name,
        rowKey,
        label: labelParts.join(" · ") || cur.label,
        sellBefore: cur.sell,
        sellAfter,
        costBefore: cur.cost,
        costAfter,
      });
    }
  }
  return changes;
}

async function handlePreview(req: Request, ctx: UserContext) {
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch_id");
  if (!branchId) throw new Error("branch_id required");
  await assertBranchAccess(ctx.admin, ctx.userClient, ctx.userId, branchId);
  const { data: branch } = await ctx.admin
    .from("branches")
    .select("tenant_id")
    .eq("id", branchId)
    .single();
  if (!branch) throw new Error("Branch not found");

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) throw new Error("file required");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const changes = await parseWorkbookForBranch(ctx.admin, branchId, branch.tenant_id, bytes);
  return new Response(
    JSON.stringify({
      filename: file.name,
      changes,
      summary: summarise(changes),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function summarise(changes: DiffRow[]) {
  const byTab: Record<string, number> = {};
  for (const c of changes) byTab[c.tab] = (byTab[c.tab] ?? 0) + 1;
  return { total: changes.length, byTab };
}

// ---------- APPLY ----------
async function handleApply(req: Request, ctx: UserContext) {
  const body = await req.json();
  const branchId = body.branch_id as string;
  const filename = (body.filename ?? "pricing.xlsx") as string;
  const changes = (body.changes ?? []) as DiffRow[];
  if (!branchId) throw new Error("branch_id required");
  await assertBranchAccess(ctx.admin, ctx.userClient, ctx.userId, branchId);
  const { data: branch } = await ctx.admin
    .from("branches")
    .select("tenant_id")
    .eq("id", branchId)
    .single();
  if (!branch) throw new Error("Branch not found");

  // Apply, capturing before-values into snapshot
  const snapshot: Array<{
    tab: string;
    rowKey: string;
    label: string;
    before: { sell: number; cost: number };
    after: { sell: number; cost: number };
  }> = [];
  const errors: string[] = [];
  for (const change of changes) {
    const tab = findTab(change.tab);
    if (!tab) {
      errors.push(`Unknown tab ${change.tab}`);
      continue;
    }
    try {
      const { before, label } = await tab.applyRow(
        ctx.admin,
        change.rowKey,
        change.sellAfter,
        change.costAfter,
        branchId,
        branch.tenant_id,
      );
      snapshot.push({
        tab: change.tab,
        rowKey: change.rowKey,
        label,
        before,
        after: { sell: change.sellAfter, cost: change.costAfter },
      });
    } catch (e) {
      errors.push(`${change.rowKey}: ${(e as Error).message}`);
    }
  }

  const { data: snap, error: snapErr } = await ctx.admin
    .from("branch_pricing_import_snapshots")
    .insert({
      branch_id: branchId,
      tenant_id: branch.tenant_id,
      uploaded_by: ctx.userId,
      filename,
      row_count: snapshot.length,
      snapshot,
    })
    .select("id")
    .single();
  if (snapErr) throw snapErr;

  return new Response(
    JSON.stringify({ snapshot_id: snap.id, applied: snapshot.length, errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// ---------- UNDO ----------
async function handleUndo(req: Request, ctx: UserContext) {
  const body = await req.json();
  const snapshotId = body.snapshot_id as string;
  if (!snapshotId) throw new Error("snapshot_id required");
  const { data: snap } = await ctx.admin
    .from("branch_pricing_import_snapshots")
    .select("id, branch_id, tenant_id, snapshot, reverted_at")
    .eq("id", snapshotId)
    .single();
  if (!snap) throw new Error("Snapshot not found");
  if (snap.reverted_at) throw new Error("Snapshot already reverted");
  await assertBranchAccess(ctx.admin, ctx.userClient, ctx.userId, snap.branch_id);

  let reverted = 0;
  const errors: string[] = [];
  for (const row of snap.snapshot as any[]) {
    const tab = findTab(row.tab);
    if (!tab) continue;
    try {
      await tab.applyRow(
        ctx.admin,
        row.rowKey,
        row.before.sell,
        row.before.cost,
        snap.branch_id,
        snap.tenant_id,
      );
      reverted++;
    } catch (e) {
      errors.push(`${row.rowKey}: ${(e as Error).message}`);
    }
  }
  await ctx.admin
    .from("branch_pricing_import_snapshots")
    .update({ reverted_at: new Date().toISOString() })
    .eq("id", snapshotId);
  return new Response(JSON.stringify({ reverted, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "export";
    const ctx = await getUser(req);
    if (!ctx) {
      return new Response(JSON.stringify({ error: "Unauthorised" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "export") {
      const branchId = url.searchParams.get("branch_id");
      if (!branchId) throw new Error("branch_id required");
      await assertBranchAccess(ctx.admin, ctx.userClient, ctx.userId, branchId);
      return await handleExport(ctx.admin, branchId);
    }
    if (action === "preview") return await handlePreview(req, ctx);
    if (action === "apply") return await handleApply(req, ctx);
    if (action === "undo") return await handleUndo(req, ctx);

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("branch-pricing-workbook error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
