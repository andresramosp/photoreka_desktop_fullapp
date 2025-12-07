import { ref, onMounted, onUnmounted } from "vue";

/**
 * Composable to detect if the current device should use touch controls.
 * Returns true ONLY for touch-only devices (mobile, tablets without external mouse).
 * For laptops with external mouse + touchscreen, returns false so keyboard+mouse controls are used.
 * Detects external mouse by listening for mouse events (not trackpad).
 * @returns {Object} { hasTouch: Ref<boolean> }
 */
export function useHasTouch() {
  let hasExternalMouse = false;
  let mouseInactivityTimeout = null;

  const checkHasTouchOnly = () => {
    // Check if device has touch capability
    const hasTouchScreen =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0;

    // If no touch, definitely not touch-only
    if (!hasTouchScreen) {
      return false;
    }

    // If an external mouse has been detected via events, use keyboard+mouse controls
    if (hasExternalMouse) {
      return false;
    }

    // Touch-only device (mobile, tablet without external mouse)
    return true;
  };

  // Handler para detectar ratón externo mediante movimiento
  const handleMouseMove = () => {
    if (!hasExternalMouse) {
      hasExternalMouse = true;
      hasTouch.value = false;
      // Solo log si estamos en desarrollo
      if (process.env.NODE_ENV === "development") {
        console.log(
          "🖱️ Ratón externo detectado - activando controles teclado+ratón"
        );
      }
    }

    // Resetear timeout para seguir considerando que hay ratón activo
    if (mouseInactivityTimeout) {
      clearTimeout(mouseInactivityTimeout);
    }
  };

  // 🔧 CRÍTICO: Inicializar inmediatamente para que el valor esté disponible desde el primer uso
  const hasTouch = ref(checkHasTouchOnly());

  const updateHasTouch = () => {
    hasTouch.value = checkHasTouchOnly();
  };

  onMounted(() => {
    updateHasTouch();

    // Listen for mouse movement to detect external mouse
    // Use capture phase to catch events early
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mousedown", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseMove, true);
  });

  onUnmounted(() => {
    window.removeEventListener("mousemove", handleMouseMove, true);
    window.removeEventListener("mousedown", handleMouseMove, true);
    window.removeEventListener("mouseup", handleMouseMove, true);

    if (mouseInactivityTimeout) {
      clearTimeout(mouseInactivityTimeout);
    }
  });

  return {
    hasTouch,
  };
}
