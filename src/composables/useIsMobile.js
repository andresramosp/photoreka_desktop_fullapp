import { ref } from "vue";

/**
 * Composable to detect if the current device is mobile
 *
 * El estado y el listener de `resize` son singletons a nivel de módulo: todas
 * las llamadas comparten el mismo ref. Antes cada instancia registraba su
 * propio listener, lo que en grillas con miles de PhotoCard significaba miles
 * de handlers de `resize` ejecutándose en cada redimensión.
 *
 * @returns {Object} { isMobile: Ref<boolean> }
 */

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
const isMobile = ref(typeof window === "undefined" ? false : checkIsMobile());

let listening = false;

const ensureListener = () => {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("resize", () => {
    isMobile.value = checkIsMobile();
  });
  listening = true;
};

export function useIsMobile() {
  ensureListener();

  return {
    isMobile,
  };
}
