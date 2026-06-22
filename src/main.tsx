import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installStorefrontTenantHeader } from "./lib/storefrontTenantHeader";

installStorefrontTenantHeader();

// Safety net for stale chunks after a redeploy. When Vite fails to fetch a
// dynamically imported module (typical after a new build while a tab is open),
// reload the page so the user gets the fresh index.html + chunk hashes
// instead of a silent failure mid-flow (e.g. during checkout).
if (typeof window !== "undefined") {
  let reloading = false;
  const triggerReload = (reason: unknown) => {
    if (reloading) return;
    reloading = true;
    // eslint-disable-next-line no-console
    console.warn("[app] stale chunk detected, reloading", reason);
    try {
      const url = new URL(window.location.href);
      // Bust any intermediate caches.
      url.searchParams.set("_v", Date.now().toString());
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  };

  window.addEventListener("vite:preloadError", (e) => triggerReload(e));
  window.addEventListener("error", (e) => {
    const msg = String(e?.message || "");
    if (
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Importing a module script failed")
    ) {
      triggerReload(msg);
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e as any)?.reason?.message || (e as any)?.reason || "");
    if (
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Importing a module script failed")
    ) {
      triggerReload(msg);
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
