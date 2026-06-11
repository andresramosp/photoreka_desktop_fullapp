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

declare module "@/stores/searchStore.js" {
  export const visualAspectsOptions: any[];
}

declare module "@/composables/useLocalPhotoSelection" {
  export function useLocalPhotoSelection(): {
    selectedPhotoIds: any;
    selectAllPhotos: (ids: Array<string | number>) => void;
    clearAllSelections: () => void;
  };
}

declare module "@/composables/usePhotoDownload.js" {
  export function usePhotoDownload(): {
    downloadPhotosZip: (photos: any[]) => Promise<void>;
    isDownloading: any;
  };
}

declare module "@/composables/usePhotoToolSelection.js" {
  export function usePhotoToolSelection(): {
    isProcessing: any;
    showToolSelector: any;
    takeToTool: (
      toolId: string,
      photoIds: Array<string | number>,
      onDone?: () => void,
      canvasId?: string | null,
    ) => Promise<void>;
    takeToChat: (
      photoIds: Array<string | number>,
      onDone?: () => void,
    ) => Promise<void>;
    openToolSelector: () => void;
    closeToolSelector: () => void;
  };
}

declare module "@/composables/useIsMobile.js" {
  export function useIsMobile(): {
    isMobile: any;
  };
}
