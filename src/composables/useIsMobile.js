import { ref, onMounted, onUnmounted } from "vue";

/**
 * Composable to detect if the current device is mobile
 * @returns {Object} { isMobile: Ref<boolean> }
 */
export function useIsMobile() {
  const isMobile = ref(false);

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
    isMobile.value = width < 768 || (isMobileAgent && !isTablet);
  };

  onMounted(() => {
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", checkIsMobile);
  });

  return {
    isMobile,
  };
}
