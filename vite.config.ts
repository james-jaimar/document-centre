import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

/**
 * After Vite builds dist/index.html, copy it to known SPA deep-link paths
 * that S3/CloudFront would otherwise 404 on. S3 issues a 301 from
 * `/pay/payfast` → `/pay/payfast/`, and without an object at that key the
 * trailing-slash request 404s before the SPA can take over.
 *
 * Add additional paths here as new deep-link routes that customers may
 * land on directly (hard-refresh, bookmarks, return URLs) are introduced.
 */
const SPA_FALLBACK_PATHS = ["pay/payfast"];

function spaDeepLinkFallback(): Plugin {
  return {
    name: "spa-deep-link-fallback",
    apply: "build",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      const indexPath = path.join(distDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const html = fs.readFileSync(indexPath, "utf8");
      for (const route of SPA_FALLBACK_PATHS) {
        const target = path.join(distDir, route, "index.html");
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, html);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    spaDeepLinkFallback(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

