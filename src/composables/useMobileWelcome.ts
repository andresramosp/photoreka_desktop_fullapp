import { ref, onMounted } from "vue";
import { isMobileDevice } from "@/utils/utils.js";

const MOBILE_WELCOME_DISMISSED_KEY = "photoreka_mobile_welcome_dismissed";

export function useMobileWelcome() {
  const shouldShowMobileWelcome = ref(false);

  const checkMobileWelcome = () => {
    if (isMobileDevice()) {
      const dismissed = localStorage.getItem(MOBILE_WELCOME_DISMISSED_KEY);
      // Show welcome if not dismissed in this session
      if (!dismissed) {
        shouldShowMobileWelcome.value = true;
      }
    }
  };

  const dismissMobileWelcome = () => {
    shouldShowMobileWelcome.value = false;
    // Store dismissal for this session
    localStorage.setItem(MOBILE_WELCOME_DISMISSED_KEY, "true");
  };

  // Clear on session end (optional - can be changed to sessionStorage if preferred)
  const resetMobileWelcome = () => {
    localStorage.removeItem(MOBILE_WELCOME_DISMISSED_KEY);
  };

  onMounted(() => {
    checkMobileWelcome();
  });

  return {
    shouldShowMobileWelcome,
    dismissMobileWelcome,
    resetMobileWelcome,
    isMobileDevice: () => isMobileDevice(),
  };
}
