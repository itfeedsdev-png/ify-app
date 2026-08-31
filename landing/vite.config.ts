import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Standalone landing page build for Vercel.
 *
 * The landing page lives in the orchestrator client tree, so we alias it and
 * reuse `orchestrator/public` as the public dir (screenshot assets live under
 * `public/landing/*.png`).
 */
export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, "../orchestrator/public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@landing": path.resolve(
        __dirname,
        "../orchestrator/src/client/pages/LandingPage.tsx",
      ),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
