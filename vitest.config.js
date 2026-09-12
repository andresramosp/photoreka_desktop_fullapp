import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Deliberately NOT an extension of `vite.config.js`.
 *
 * That config is what builds production: the Vue plugin, the PWA service worker, the
 * version manifest. None of it is needed to run a pure function, and pulling it in would
 * make the test run depend on the deploy pipeline — so a change to one could break the
 * other for no reason. Only the `@` alias is shared, because the source files use it.
 *
 * Add `environment: "jsdom"` (and the dependency) if a test ever needs to mount a
 * component. Everything covered so far is plain data in, plain data out.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.spec.js"],
    environment: "node",
  },
});
