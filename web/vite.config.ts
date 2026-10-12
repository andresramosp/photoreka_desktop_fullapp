import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { templateCompilerOptions } from "@tresjs/core";
import { VitePWA } from "vite-plugin-pwa";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
);
const appVersion = process.env.RAILWAY_GIT_COMMIT_SHA || packageJson.version;
const builtAt = new Date().toISOString();

// Por defecto un deploy es SILENCIOSO: ni recarga automática ni aviso al usuario.
// Para cambiarlo puntualmente, publica el build con una de estas variables:
//   PHOTOREKA_FORCE_RELOAD=true  -> las pestañas abiertas se recargan solas (crítico)
//   PHOTOREKA_UPDATE_NOTICE=true -> aviso con botón "Update", el usuario decide
const forceReload = process.env.PHOTOREKA_FORCE_RELOAD === "true";
const updateNotice = process.env.PHOTOREKA_UPDATE_NOTICE === "true";

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    {
      name: "photoreka-version-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify(
            {
              version: appVersion,
              builtAt,
              forceReload,
              updateNotice,
            },
            null,
            2,
          ),
        });
      },
    },
    vue({
      // TresJS template compiler options
      ...templateCompilerOptions,
    }),
    VitePWA({
      // "prompt" en vez de "autoUpdate": con autoUpdate el cliente de
      // vite-plugin-pwa engancha `activated` -> window.location.reload(), lo que
      // recargaba la app sola en la primera carga tras cada deploy. En "prompt"
      // el SW nuevo queda en espera y quien decide recargar es src/utils/appUpdate.ts.
      registerType: "prompt",
      injectRegister: "auto",
      devOptions: {
        enabled: false,
      },
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
        // Precache hashed static assets, but never the HTML app shell.
        // A dormant browser must fetch the latest index.html from the network.
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MB limit per file
        cleanupOutdatedCaches: true,
        navigateFallback: null,
        // El SW nuevo espera en lugar de tomar el control de golpe. Necesario para
        // el modo "prompt": sin esto se activaría solo y forzaría la recarga.
        clientsClaim: false,
        skipWaiting: false,
        // Don't cache anything with these patterns (always network first)
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^\/auth\//,
            handler: "NetworkOnly",
          },
        ],
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
