import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { templateCompilerOptions } from "@tresjs/core";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // TresJS template compiler options
      ...templateCompilerOptions,
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      maxParallelFileOps: 20,
    },
  },
  server: {
    port: 5173,
    host: "localhost",
    cors: true,
    hmr: {
      overlay: false,
    },
    headers: {
      // Remover COOP restrictivo para permitir OAuth popups de Google
      // "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      // "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
