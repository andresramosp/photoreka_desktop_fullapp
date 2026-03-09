import { usePhotosStore } from "@/stores/photos";
import type { Router } from "vue-router";

/**
 * Determines the correct entry page based on user's photo status
 * @returns The path to redirect to: /sync-area#upload if blocked, /dashboard otherwise
 */
export function getEntryPagePath(): string {
  const photosStore = usePhotosStore();

  // If user is blocked (no photos), direct them to upload
  if (photosStore.appAccessMode === "blocked") {
    return "/sync-area#upload";
  }

  // Otherwise, go to dashboard
  return "/dashboard";
}

/**
 * Redirects to the appropriate entry page based on user's photo status
 * @param router - Vue Router instance
 * @param replace - Whether to use replace instead of push (default: false)
 */
export function redirectToEntryPage(router: Router, replace = false): void {
  const path = getEntryPagePath();

  if (replace) {
    router.replace(path);
  } else {
    router.push(path);
  }
}

/**
 * Composable that provides entry page redirect functionality
 */
export function useEntryPageRedirect() {
  return {
    getEntryPagePath,
    redirectToEntryPage,
  };
}
