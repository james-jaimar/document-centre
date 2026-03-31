import "https://deno.land/std@0.224.0/dotenv/load.ts";

const DOCUMENT_CENTRE_API_URL = Deno.env.get("DOCUMENT_CENTRE_API_URL") || Deno.env.get("VPS_PDF_API_URL");

Deno.test("fetch openapi docs directly from server", async () => {
  if (!DOCUMENT_CENTRE_API_URL) {
    console.log("No DOCUMENT_CENTRE_API_URL set, trying known URL");
  }
  
  // Try the known URL patterns
  const baseUrls = DOCUMENT_CENTRE_API_URL 
    ? [DOCUMENT_CENTRE_API_URL.replace(/\/+$/, "")]
    : ["https://document-centre-api.jaimar.dev"];
  
  for (const base of baseUrls) {
    for (const path of ["docs", "openapi.json", "redoc", "api/docs", "v1"]) {
      try {
        const res = await fetch(`${base}/${path}`, { method: "GET" });
        const text = await res.text();
        console.log(`GET ${base}/${path}: ${res.status} (${text.length} chars)`);
        if (res.status === 200 && text.length < 5000) {
          console.log(text.slice(0, 2000));
        } else if (res.status === 200) {
          console.log(text.slice(0, 3000));
        }
      } catch (e) {
        console.log(`GET ${base}/${path}: ERROR ${e.message}`);
      }
    }
  }
});
