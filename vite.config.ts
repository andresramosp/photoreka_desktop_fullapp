import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { templateCompilerOptions } from "@tresjs/core";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // TresJS template compiler options
      ...templateCompilerOptions,
    }),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Photoreka - Curation Lab",
        short_name: "Photoreka",
        description:
          "Organize and curate your photo library with advanced AI tools.",
        theme_color: "#101014",
        background_color: "#101014",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Only precache the app shell; don't cache API calls or large media
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MB limit per file
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
      },
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
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("pixi.js") || id.includes("@pixi"))
              return "vendor-pixi";
            if (id.includes("konva") || id.includes("vue-konva"))
              return "vendor-konva";
            if (id.includes("leaflet") || id.includes("vue-leaflet"))
              return "vendor-leaflet";
            if (id.includes("firebase")) return "vendor-firebase";
            if (
              id.includes("vue") ||
              id.includes("pinia") ||
              id.includes("vue-router")
            )
              return "vendor-vue";
            return "vendor";
          }
        },
      },
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
