/**
 * Single, production-safe pdf.js worker setup.
 *
 * Amplify's default SPA rewrite doesn't whitelist `.mjs`, so a separately
 * emitted worker asset gets rewritten to index.html and served as text/html
 * ("Failed to fetch dynamically imported module ... pdf.worker-xxxx.mjs").
 * Inlining the worker source and running it from a blob URL avoids that.
 * Our CSP allows `worker-src 'self' blob:`, so a blob URL works in production.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - vite handles the ?raw import
import pdfWorkerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";

const workerBlob = new Blob([pdfWorkerSource as unknown as string], {
  type: "application/javascript",
});

export const pdfWorkerSrc = URL.createObjectURL(workerBlob);

/** Apply the worker source to any pdf.js-like namespace (pdfjs-dist or react-pdf). */
export function applyPdfWorker(lib: { GlobalWorkerOptions: { workerSrc: string } }) {
  lib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
}
