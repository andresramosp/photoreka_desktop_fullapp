import { ref, onMounted, onUnmounted } from "vue";

/**
 * Composable to detect if the current device has touch capabilities
 * Works for mobile, tablets, laptops with touchscreens, etc.
 * @returns {Object} { hasTouch: Ref<boolean> }
 */
export function useHasTouch() {
  const hasTouch = ref(false);

  const checkHasTouch = () => {
    // Check multiple ways to detect touch capability
    const hasTouchScreen =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0;

    hasTouch.value = hasTouchScreen;
  };

  onMounted(() => {
    checkHasTouch();
    // Touch capability doesn't change, but we add a listener just in case
    window.addEventListener("resize", checkHasTouch);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", checkHasTouch);
  });

  return {
    hasTouch,
  };
}
