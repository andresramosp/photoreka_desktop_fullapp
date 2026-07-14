import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * The dashboard chat can take over the whole view, folding away the side panels.
 * The state lives in a store rather than in the dashboard because the sidebar
 * logo — outside the dashboard's tree — collapses it on the way home.
 */
export const useChatFullscreenStore = defineStore("chatFullscreen", () => {
  const isFullscreen = ref(false);

  function set(value: boolean) {
    isFullscreen.value = Boolean(value);
  }

  function exit() {
    isFullscreen.value = false;
  }

  return { isFullscreen, set, exit };
});
