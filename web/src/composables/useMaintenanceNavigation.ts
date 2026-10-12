import { useRouter, useRoute } from "vue-router";
import type { RouteLocationRaw } from "vue-router";

/**
 * Composable for navigation that preserves maintenance bypass parameter
 */
export function useMaintenanceNavigation() {
  const router = useRouter();
  const route = useRoute();

  // Navigate while preserving the isMe bypass parameter if present
  const navigateWithBypass = (to: RouteLocationRaw) => {
    const currentHasBypass = route.query.isMe === "true";

    if (currentHasBypass) {
      // If current route has bypass, ensure new route also has it
      if (typeof to === "string") {
        const separator = to.includes("?") ? "&" : "?";
        router.push(`${to}${separator}isMe=true`);
      } else if (typeof to === "object") {
        const newTo = {
          ...to,
          query: {
            ...to.query,
            isMe: "true",
          },
        };
        router.push(newTo);
      }
    } else {
      router.push(to);
    }
  };

  // Replace while preserving the isMe bypass parameter if present
  const replaceWithBypass = (to: RouteLocationRaw) => {
    const currentHasBypass = route.query.isMe === "true";

    if (currentHasBypass) {
      if (typeof to === "string") {
        const separator = to.includes("?") ? "&" : "?";
        router.replace(`${to}${separator}isMe=true`);
      } else if (typeof to === "object") {
        const newTo = {
          ...to,
          query: {
            ...to.query,
            isMe: "true",
          },
        };
        router.replace(newTo);
      }
    } else {
      router.replace(to);
    }
  };

  // Check if currently bypassing maintenance
  const isBypassingMaintenance = () => {
    return route.query.isMe === "true";
  };

  return {
    navigateWithBypass,
    replaceWithBypass,
    isBypassingMaintenance,
  };
}
