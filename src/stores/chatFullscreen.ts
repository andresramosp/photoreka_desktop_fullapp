import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * The dashboard chat can take over the whole view, folding away the side panels.
 * The state lives in a store rather than in the dashboard because the sidebar
 * logo — outside the dashboard's tree — collapses it on the way home.
 */
export const useChatFullscreenStore = defineStore("chatFullscreen", () => {
  const isFullscreen = ref(false);

  /**
   * An empty library turns fullscreen from a preference into the only sensible
   * layout: the panels around the chat would hold nothing but placeholders. So
   * the dashboard locks it, and every other way out of fullscreen — the sidebar
   * logo, the chat's own toggle — goes quiet until there are photos again.
   */
  const isLocked = ref(false);

  function set(value: boolean) {
    if (isLocked.value) return;
    isFullscreen.value = Boolean(value);
  }

  function exit() {
    set(false);
  }

  function lock() {
    isLocked.value = true;
    isFullscreen.value = true;
  }

  function unlock() {
    isLocked.value = false;
  }

  return { isFullscreen, isLocked, set, exit, lock, unlock };
});
