import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user with anon client using their token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const { type, id, disposition } = body as {
      type: "invoice" | "document";
      id: string;
      disposition?: "inline" | "attachment";
    };

    if (!type || !id) {
      return new Response(
        JSON.stringify({ error: "Missing type or id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Service role client for privileged operations
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let storageBucket: string;
    let storagePath: string;
    let fileName: string;
    let mimeType = "application/pdf";

    if (type === "invoice") {
      // Look up invoice + verify access via order
      const { data: inv, error: invErr } = await admin
        .from("order_invoices")
        .select("storage_bucket, storage_path, invoice_number, order_id")
        .eq("id", id)
        .single();

      if (invErr || !inv) {
        return new Response(
          JSON.stringify({ error: "Invoice not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Verify user can read this order (use user's client so RLS applies)
      const { data: order, error: orderErr } = await userClient
        .from("orders")
        .select("id")
        .eq("id", inv.order_id)
        .single();

      if (orderErr || !order) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      storageBucket = inv.storage_bucket;
      storagePath = inv.storage_path;
      fileName = `${inv.invoice_number}.pdf`;
    } else {
      // type === "document"
      const { data: doc, error: docErr } = await admin
        .from("order_documents")
        .select(
          "storage_bucket, storage_path, file_name, mime_type, order_id"
        )
        .eq("id", id)
        .single();

      if (docErr || !doc) {
        return new Response(
          JSON.stringify({ error: "Document not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Verify access via RLS on user's client
      const { data: order, error: orderErr } = await userClient
        .from("orders")
        .select("id")
        .eq("id", doc.order_id)
        .single();

      if (orderErr || !order) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      storageBucket = doc.storage_bucket;
      storagePath = doc.storage_path;
      fileName = doc.file_name;
      mimeType = doc.mime_type || "application/pdf";
    }

    // Fetch file using service role
    const { data: fileData, error: fileErr } = await admin.storage
      .from(storageBucket)
      .download(storagePath);

    if (fileErr || !fileData) {
      console.error("Storage download error:", fileErr);
      return new Response(
        JSON.stringify({
          error: "File not found in storage",
          detail: fileErr?.message,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Stream the file back
    const disp = disposition === "inline" ? "inline" : "attachment";
    return new Response(fileData, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": mimeType,
        "Content-Disposition": `${disp}; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("document-access error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
