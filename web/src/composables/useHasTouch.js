import { ref, onMounted } from "vue";

/**
 * Composable to detect if the device is mobile or tablet.
 * Returns true for mobile/tablet devices, false for laptops/desktops.
 * @returns {Object} { hasTouch: Ref<boolean> }
 */
export function useHasTouch() {
  const hasTouch = ref(false);

  const isMobileOrTablet = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileRegex =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    return mobileRegex.test(userAgent);
  };

  onMounted(() => {
    hasTouch.value = isMobileOrTablet();
  });

  return {
    hasTouch,
  };
}
