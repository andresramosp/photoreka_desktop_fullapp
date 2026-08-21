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

// Un layout desktop necesita ancho, pero sobre todo necesita NO ser un lienzo
// claramente vertical. Una tablet en vertical (p.ej. 1200x1900) supera los
// 768px de ancho y por tanto caía en el layout desktop, quedando comprimido e
// ilegible. Tratamos ese caso como mobile.
//
// El gate de `pointer: coarse` es lo que garantiza que esto NUNCA afecte a un
// desktop por muy estrecha que se haga la ventana: un ratón/trackpad reporta
// `pointer: fine`, así que un navegador de escritorio jamás entra por esta vía
// (si se estrecha de verdad, ya lo captura el umbral de 768px de ancho).
const PORTRAIT_RATIO_THRESHOLD = 1.2; // alto/ancho: claramente vertical

const isCoarsePointer = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

const isTallPortrait = () => {
  const { innerWidth: width, innerHeight: height } = window;
  if (!width || !height) return false;
  return height / width >= PORTRAIT_RATIO_THRESHOLD;
};

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
  if (width < 768 || (isMobileAgent && !isTablet)) return true;

  // Tablet (o cualquier dispositivo táctil) sostenida en vertical: el layout
  // desktop no cabe, usamos el mobile.
  return isCoarsePointer() && isTallPortrait();
};

// 🔧 CRÍTICO: Inicializar inmediatamente para que el valor esté disponible desde el primer uso
const isMobile = ref(typeof window === "undefined" ? false : checkIsMobile());

let listening = false;

const ensureListener = () => {
  if (listening || typeof window === "undefined") return;
  const update = () => {
    isMobile.value = checkIsMobile();
  };
  window.addEventListener("resize", update);
  // Algunos navegadores móviles no disparan `resize` de forma fiable al rotar.
  window.addEventListener("orientationchange", update);
  listening = true;
};

export function useIsMobile() {
  ensureListener();

  return {
    isMobile,
  };
}
