import { ref, onMounted, onUnmounted } from "vue";

/**
 * Composable to detect if the current device is mobile
 * @returns {Object} { isMobile: Ref<boolean> }
 */
export function useIsMobile() {
  const checkIsMobile = () => {
    // Check both screen width and user agent
    const width = window.innerWidth;
    const userAgent = navigator.userAgent.toLowerCase();

    // Check for mobile user agents
    const mobileRegex =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const isMobileAgent = mobileRegex.test(userAgent);

    // Check for tablet-specific patterns
    const isTablet = /ipad|android(?!.*mobile)/i.test(userAgent);

    // Consider mobile if width is less than 768px OR it's a mobile user agent (but not tablet)
    return width < 768 || (isMobileAgent && !isTablet);
  };

  // 🔧 CRÍTICO: Inicializar inmediatamente para que el valor esté disponible desde el primer uso
  const isMobile = ref(checkIsMobile());

  const updateIsMobile = () => {
    isMobile.value = checkIsMobile();
  };

  onMounted(() => {
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", updateIsMobile);
  });

  return {
    isMobile,
  };
}
