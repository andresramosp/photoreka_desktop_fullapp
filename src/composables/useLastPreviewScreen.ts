import { ref } from "vue";

/**
 * Tracks the last "previewable" full screen the user opened, so PhotoUniverse's
 * dashboard preview can follow it when the mode selector is set to "auto".
 *
 * `lastPreviewMode` is persisted: on a fresh load "auto" points the dashboard
 * preview at wherever the user last was. `lastPreviewConsumed` lives only in
 * module memory — navigating to any previewable screen (via the preview, the
 * menu, a tab, a URL) consumes the gateway, turning the dashboard into the chat
 * workspace for the rest of the tab session; a reload re-arms it.
 */
export type PreviewMode = "tagcloud" | "photos2d" | "worldmap" | "canvas";

// Route name -> the PhotoUniverse visualization mode that previews that screen.
const ROUTE_PREVIEW_MODE: Record<string, PreviewMode> = {
  tagcloud: "tagcloud",
  atlas: "photos2d",
  "world-map": "worldmap",
  canvas: "canvas",
};

const STORAGE_KEY = "photoreka:universe:lastPreviewScreen";
const PREVIEW_MODES = Object.values(ROUTE_PREVIEW_MODE);

function readStored(): PreviewMode | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY) as PreviewMode | null;
  return stored && PREVIEW_MODES.includes(stored) ? stored : null;
}

const lastPreviewMode = ref<PreviewMode | null>(readStored());
const lastPreviewConsumed = ref(false);

export function recordPreviewScreenVisit(routeName: string | undefined): void {
  if (!routeName) return;
  const mode = ROUTE_PREVIEW_MODE[routeName];
  if (!mode) return;
  lastPreviewMode.value = mode;
  // Reaching a previewable screen at all consumes the "auto" gateway for the
  // session — however the user got there.
  lastPreviewConsumed.value = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private mode / storage disabled — the in-memory ref still works */
  }
}

// Re-picking "auto" in the selector re-arms the gateway even mid-session.
export function rearmLastPreview(): void {
  lastPreviewConsumed.value = false;
}

export function useLastPreviewScreen() {
  return { lastPreviewMode, lastPreviewConsumed };
}
