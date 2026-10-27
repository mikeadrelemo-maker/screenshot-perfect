// vite.pages.config.ts — Dedicated Vite config for GitHub Pages static build.
// Uses @vitejs/plugin-react directly (no TanStack Start / Nitro / SSR).
// Output: dist/ — a plain static SPA deployable to GitHub Pages.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

export default defineConfig({
  plugins: [tailwindcss(), react(), tsconfigPaths()],

  // The repo name is the sub-path on GitHub Pages:
  //   https://mikeadrelemo-maker.github.io/screenshot-perfect/
  base: "/screenshot-perfect/",

  root: ".",
  publicDir: "public",

  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Generate a manifest so the workflow can verify the build
    manifest: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },

  // Vite needs to know how to handle the pdfjs worker import
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
  },

  worker: {
    format: "es",
  },
});
