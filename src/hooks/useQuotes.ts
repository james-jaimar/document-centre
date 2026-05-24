import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";
import { copyS3Object } from "@/lib/s3Storage";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";

const QK_LIST = "my_quotes";
const QK_ONE = "quote";

const DEFAULT_VALIDITY_DAYS = 30;

async function getValidityDays(tenantId: string): Promise<number> {
  const { data } = await supabase
    .from("tenant_settings")
    .select("setting_value")
    .eq("tenant_id", tenantId)
    .eq("category", "quotes")
    .eq("setting_key", "default_validity_days")
    .maybeSingle();
  const raw = data?.setting_value as any;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_VALIDITY_DAYS;
}

/* ── Queries ────────────────────────────────────────────── */

export function useMyQuotes() {
  const { user } = useAuth();
  const { tenantId } = useTenantContext();

  return useQuery({
    queryKey: [QK_LIST, user?.id, tenantId],
    enabled: !!user?.id && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, name, quote_status, valid_until, total_amount, currency, created_at, expired_at, declined_at, converted_at")
        .eq("tenant_id", tenantId!)
        .eq("customer_profile_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useQuote(quoteId: string | undefined) {
  return useQuery({
    queryKey: [QK_ONE, quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, quote_items(*)")
        .eq("id", quoteId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/* ── Save cart as quote ─────────────────────────────────── */

export function useSaveCartAsQuote() {
  const { user } = useAuth();
  const { tenantId, appId } = useTenantContext();
  const { activeBranch } = useBranch();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { cartOrderId: string; name?: string }) => {
      if (!user) throw new Error("Sign in required to save a quote");
      if (!tenantId || !appId) throw new Error("No tenant context");

      // Load cart with items
      const { data: cart, error: cartErr } = await supabase
        .from("orders")
        .select("*, order_items(*, product_families:product_family_id(name, slug))")
        .eq("id", input.cartOrderId)
        .single();
      if (cartErr || !cart) throw cartErr ?? new Error("Cart not found");

      const items = (cart.order_items as any[]) ?? [];
      if (!items.length) throw new Error("Cart is empty");

      // Pull profile for snapshot
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, first_name, last_name, display_name")
        .eq("id", user.id)
        .single();

      // Resolve quote number via RPC
      const { data: numberData, error: numErr } = await supabase
        .rpc("generate_quote_number", { p_app_id: appId });
      if (numErr) throw numErr;
      const quoteNumber = numberData as unknown as string;

      const validityDays = await getValidityDays(tenantId);
      const validUntil = new Date(Date.now() + validityDays * 86400_000).toISOString();

      const subtotal = items.reduce(
        (s, i) => s + Number(i.unit_price) * Number(i.quantity),
        0
      );

      // Insert quote
      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .insert({
          app_id: appId,
          tenant_id: tenantId,
          branch_id: activeBranch?.id ?? cart.branch_id ?? null,
          quote_number: quoteNumber,
          name: input.name ?? null,
          customer_profile_id: user.id,
          customer_email: profile?.email ?? user.email ?? null,
          customer_name:
            profile?.display_name ||
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
            null,
          created_by_profile_id: user.id,
          created_via: "customer_self_serve",
          source_order_id: cart.id,
          quote_status: "active" as any,
          valid_until: validUntil,
          currency: cart.currency ?? "ZAR",
          subtotal,
          total_amount: subtotal,
        })
        .select("id, quote_number")
        .single();
      if (qErr) throw qErr;

      // Insert quote_items (snapshots)
      const quoteItems = items.map((it: any, idx: number) => ({
        quote_id: quote.id,
        sequence_no: idx + 1,
        product_family_id: it.product_family_id ?? null,
        product_name: it.product_families?.name ?? it.title ?? "Item",
        job_name: it.title ?? null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        net_price: Number(it.unit_price) * Number(it.quantity),
        gross_price: Number(it.unit_price) * Number(it.quantity),
        product_snapshot: it.product_families ?? null,
        configuration: it.spec ?? null,
      }));
      const { error: itemsErr } = await supabase.from("quote_items").insert(quoteItems);
      if (itemsErr) throw itemsErr;

      // Park the cart order: change status to 'quoted' so it stops being the active cart
      // but its order_items / documents / sections remain intact for later re-clone.
      await supabase
        .from("orders")
        .update({
          order_status: "quoted" as any,
          metadata: {
            ...((cart.metadata as Record<string, unknown> | null) ?? {}),
            quote_id: quote.id,
            is_quote_holding: true,
          },
        })
        .eq("id", cart.id);

      return quote;
    },
    onSuccess: () => {
      invalidateUserOrderCaches(qc);
      qc.invalidateQueries({ queryKey: [QK_LIST] });
    },
  });
}

/* ── Decline ────────────────────────────────────────────── */

export function useDeclineQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase
        .from("quotes")
        .update({
          quote_status: "declined" as any,
          declined_at: new Date().toISOString(),
        })
        .eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: (_d, quoteId) => {
      qc.invalidateQueries({ queryKey: [QK_LIST] });
      qc.invalidateQueries({ queryKey: [QK_ONE, quoteId] });
    },
  });
}

/* ── Reactivate to cart ─────────────────────────────────── */

/**
 * Clone the parked source order's items (and their documents/sections) into a
 * fresh cart order so the customer can checkout. The quote is marked
 * 'converted'.
 */
export function useReactivateQuote() {
  const { user } = useAuth();
  const { tenantId, appId } = useTenantContext();
  const { activeBranch } = useBranch();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (quoteId: string) => {
      if (!user || !tenantId) throw new Error("Not authenticated");

      // Load quote + source order_items
      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .select("id, source_order_id, currency, quote_status")
        .eq("id", quoteId)
        .single();
      if (qErr || !quote) throw qErr ?? new Error("Quote not found");
      if (!quote.source_order_id) throw new Error("Quote has no source order to restore");
      if (quote.quote_status !== "active" && quote.quote_status !== "approved") {
        throw new Error("This quote is no longer active");
      }

      const { data: srcItems, error: itemsErr } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", quote.source_order_id);
      if (itemsErr) throw itemsErr;
      if (!srcItems?.length) throw new Error("Source order has no items");

      // Find or create active cart
      const { data: existingCart } = await supabase
        .from("orders")
        .select("id")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .eq("order_status", "cart" as any)
        .limit(1)
        .maybeSingle();

      let cartId = existingCart?.id;
      if (!cartId) {
        const { data: newCart, error: ncErr } = await supabase
          .from("orders")
          .insert({
            user_id: user.id,
            tenant_id: tenantId,
            app_id: appId,
            branch_id: activeBranch?.id ?? null,
            order_status: "cart" as any,
            total_price: 0,
            currency: quote.currency ?? "ZAR",
          })
          .select("id")
          .single();
        if (ncErr) throw ncErr;
        cartId = newCart.id;
      }

      // Clone each item + its docs/sections
      for (const src of srcItems) {
        const { data: cloned, error: cErr } = await supabase
          .from("order_items")
          .insert({
            order_id: cartId,
            product_family_id: src.product_family_id,
            quantity: src.quantity,
            unit_price: src.unit_price,
            build_status: "ready" as any,
            spec: src.spec,
            title: src.title,
          })
          .select("id")
          .single();
        if (cErr) throw cErr;

        const { data: docs } = await supabase
          .from("documents")
          .select("*")
          .eq("order_item_id", src.id);

        if (docs?.length) {
          const docInserts: any[] = [];
          for (const d of docs) {
            let newPath = d.file_path;
            if (d.file_path) {
              const ext = d.file_path.includes(".")
                ? d.file_path.slice(d.file_path.lastIndexOf("."))
                : "";
              newPath = `order-items/${cloned.id}/${crypto.randomUUID()}${ext}`;
              try { await copyS3Object(d.file_path, newPath); }
              catch { newPath = d.file_path; }
            }
            docInserts.push({
              order_item_id: cloned.id,
              file_name: d.file_name,
              file_path: newPath,
              file_size: d.file_size,
              mime_type: d.mime_type,
              page_count: d.page_count,
              page_width_mm: d.page_width_mm,
              page_height_mm: d.page_height_mm,
              document_status: d.document_status,
              preflight_data: d.preflight_data,
              thumbnail_urls: d.thumbnail_urls,
              sort_order: d.sort_order,
              backend_asset_id: d.backend_asset_id,
            });
          }
          const { data: newDocs } = await supabase
            .from("documents")
            .insert(docInserts)
            .select("id");

          const idMap = new Map<string, string>();
          if (newDocs) docs.forEach((d, i) => newDocs[i] && idMap.set(d.id, newDocs[i].id));

          const { data: sections } = await supabase
            .from("document_sections")
            .select("*")
            .eq("order_item_id", src.id);
          if (sections?.length) {
            await supabase.from("document_sections").insert(
              sections.map((s) => ({
                order_item_id: cloned.id,
                document_id: s.document_id ? idMap.get(s.document_id) ?? s.document_id : null,
                section_type: s.section_type,
                page_range_start: s.page_range_start,
                page_range_end: s.page_range_end,
                paper_stock: s.paper_stock,
                paper_weight_gsm: s.paper_weight_gsm,
                is_color: s.is_color,
                is_duplex: s.is_duplex,
                lamination: s.lamination,
                sort_order: s.sort_order,
                label: s.label,
                color: s.color,
              }))
            );
          }
        }
      }

      // Recalc cart total
      const { data: cartItems } = await supabase
        .from("order_items")
        .select("unit_price, quantity")
        .eq("order_id", cartId);
      const cartTotal = (cartItems ?? []).reduce(
        (sum, item) => sum + Number(item.unit_price) * item.quantity,
        0
      );
      await supabase.from("orders").update({ total_price: cartTotal }).eq("id", cartId);

      // Mark quote as converted
      await supabase
        .from("quotes")
        .update({
          quote_status: "converted" as any,
          converted_at: new Date().toISOString(),
          converted_order_id: cartId,
        })
        .eq("id", quoteId);

      return cartId;
    },
    onSuccess: (_d, quoteId) => {
      invalidateUserOrderCaches(qc);
      qc.invalidateQueries({ queryKey: [QK_LIST] });
      qc.invalidateQueries({ queryKey: [QK_ONE, quoteId] });
    },
  });
}

/* ── Send quote email (PDF) ─────────────────────────────── */

export function useSendQuoteEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await supabase.functions.invoke("send-quote-email", {
        body: { quote_id: quoteId },
      });
      if (error) throw new Error(error.message || "Failed to send quote");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: [QK_ONE, id] });
    },
  });
}
