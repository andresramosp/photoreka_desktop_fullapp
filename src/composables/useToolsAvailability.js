import { computed } from "vue";
import { isMobileDevice } from "@/utils/utils";
import {
  getToolsForPlatform,
  getPhotoSelectorTools,
  getToolById,
  isToolAvailable,
  isDesktopOnly,
} from "@/config/toolsConfig";

/**
 * Composable for reactive tool availability based on device type.
 * Wraps the pure functions from toolsConfig with Vue computed properties.
 */
export function useToolsAvailability() {
  const isMobile = computed(() => isMobileDevice());
  const currentPlatform = computed(() =>
    isMobile.value ? "mobile" : "desktop",
  );

  // All tools available on current platform
  const availableTools = computed(() =>
    getToolsForPlatform(currentPlatform.value),
  );

  // Tools for PhotoToolSelector ("take photos to")
  const photoSelectorTools = computed(() =>
    getPhotoSelectorTools(currentPlatform.value),
  );

  // Tools filtered by menu section
  const getToolsBySection = (section) => {
    return availableTools.value.filter((tool) => tool.menuSection === section);
  };

  // Check if a tool is available on current device
  const isAvailable = (toolId) => {
    return isToolAvailable(toolId, currentPlatform.value);
  };

  return {
    isMobile,
    currentPlatform,
    availableTools,
    photoSelectorTools,
    getToolsBySection,
    isAvailable,
    // Re-export non-reactive helpers for convenience
    getToolById,
    isDesktopOnly,
  };
}
