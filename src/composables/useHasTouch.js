import { ref, onMounted, onUnmounted } from "vue";

/**
 * Composable to detect if the current device has touch capabilities
 * Works for mobile, tablets, laptops with touchscreens, etc.
 * @returns {Object} { hasTouch: Ref<boolean> }
 */
export function useHasTouch() {
  const checkHasTouch = () => {
    // Check multiple ways to detect touch capability
    const hasTouchScreen =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0;

    return hasTouchScreen;
  };

  // 🔧 CRÍTICO: Inicializar inmediatamente para que el valor esté disponible desde el primer uso
  const hasTouch = ref(checkHasTouch());

  const updateHasTouch = () => {
    hasTouch.value = checkHasTouch();
  };

  onMounted(() => {
    updateHasTouch();
    // Touch capability doesn't change, but we add a listener just in case
    window.addEventListener("resize", updateHasTouch);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", updateHasTouch);
  });

  return {
    hasTouch,
  };
}
