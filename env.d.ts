/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module "@/stores/photos" {
  export function usePhotosStore(): any;
}

declare module "@/stores/photos.js" {
  export function usePhotosStore(): any;
}
