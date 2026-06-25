// Legacy PayFast redirect endpoint.
//
// We no longer route customers through this URL — `payments-create-session`
// returns a signed PayFast form payload that the app submits from its own
// origin. This endpoint is kept only as a defensive fallback so that any
// stale link (cached browser tab, bookmarked test URL, accidental retry)
// renders a clean, non-revealing message and does NOT expose internal
// details, merchant fields, or auto-submit any form.
Deno.serve((req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const body = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}.c{background:#1e293b;padding:24px 28px;border-radius:12px;max-width:380px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.3)}h1{font-size:18px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;margin:6px 0}</style>
</head><body><div class="c">
<h1>Please return to your order</h1>
<p>This page is no longer used for payments.</p>
<p>Go back to your order in the store and tap <strong>Pay Online</strong> again, or pay by EFT.</p>
</div></body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
});
