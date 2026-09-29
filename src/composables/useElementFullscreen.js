import { ref, onMounted, onUnmounted, onDeactivated } from "vue";

/**
 * Lets a view cover the whole screen. The caller pins its element over the app shell
 * while `isFullscreen` is true; this puts the whole document (not the element) in
 * browser fullscreen, so popovers and modals teleported to <body> stay visible. Where
 * the Fullscreen API is missing or refuses (iPhone Safari), only the overlay applies.
 * Escape leaves either way.
 */
export function useElementFullscreen() {
  const isFullscreen = ref(false);
  let usingBrowserFullscreen = false;

  const browserFullscreenElement = () =>
    document.fullscreenElement ?? document.webkitFullscreenElement ?? null;

  const enter = async () => {
    if (isFullscreen.value) return;
    isFullscreen.value = true;
    const root = document.documentElement;
    const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
    if (!request) return;
    try {
      await request.call(root);
      usingBrowserFullscreen = true;
    } catch {
      // Refused (permissions, iframe policy): the overlay alone still applies.
    }
  };

  const exit = async () => {
    if (!isFullscreen.value) return;
    isFullscreen.value = false;
    const wasBrowserFullscreen = usingBrowserFullscreen;
    usingBrowserFullscreen = false;
    if (!wasBrowserFullscreen || !browserFullscreenElement()) return;
    const exitFn = document.exitFullscreen ?? document.webkitExitFullscreen;
    try {
      await exitFn?.call(document);
    } catch {
      // Already leaving (the browser's own Escape got there first).
    }
  };

  const toggle = () => (isFullscreen.value ? exit() : enter());

  // The browser's own exits (Escape, Cmd+Ctrl+F on Mac) must drop the overlay too.
  const handleBrowserFullscreenChange = () => {
    if (usingBrowserFullscreen && !browserFullscreenElement()) exit();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape" && isFullscreen.value) exit();
  };

  onMounted(() => {
    document.addEventListener("fullscreenchange", handleBrowserFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleBrowserFullscreenChange);
    document.addEventListener("keydown", handleKeyDown);
  });

  onUnmounted(() => {
    document.removeEventListener("fullscreenchange", handleBrowserFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", handleBrowserFullscreenChange);
    document.removeEventListener("keydown", handleKeyDown);
    exit();
  });

  // A KeepAlive'd view that is switched away from must not stay covering the screen.
  onDeactivated(() => exit());

  return { isFullscreen, enter, exit, toggle };
}
