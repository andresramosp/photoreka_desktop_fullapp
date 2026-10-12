import type { RouteLocationNormalizedLoaded, Router } from "vue-router";
import { matchRouteToTab } from "@/config/routeTabs";
import {
  findOpenRouteTab,
  getOpenTabInstanceId,
} from "@/composables/useRouteTabs";
import { useTabDirtyStore } from "@/stores/tabDirtyStore";

/**
 * Singleton tabs that hold an entity (Series, Portfolios, Collections) reuse a
 * single tab: opening another entity replaces the one already loaded. When the
 * entity currently in that tab has unsaved edits, replacing it destroys them
 * just like closing the tab would — so the same confirmation must run here,
 * before the navigation is committed.
 *
 * The check is against the *open tab*, not the route being left: a link from
 * anywhere in the app (photo dialog, dashboard, search…) can replace the
 * contents of a dirty tab the user isn't even looking at.
 *
 * Per-instance tabs don't need this: their old instance stays alive in its own
 * tab, edits included.
 */
export const registerTabContentGuard = (router: Router) => {
  router.beforeEach(async (to) => {
    const toMatch = matchRouteToTab(to as RouteLocationNormalizedLoaded);
    if (!toMatch || toMatch.config.mode !== "singleton") {
      return true;
    }
    if (!toMatch.config.instanceKey || !toMatch.instanceId) {
      return true;
    }

    const openTab = findOpenRouteTab(toMatch.key);
    if (!openTab) {
      return true;
    }

    const openInstanceId = getOpenTabInstanceId(openTab, router);
    if (!openInstanceId || openInstanceId === toMatch.instanceId) {
      return true;
    }

    const tabDirtyStore = useTabDirtyStore();
    if (!tabDirtyStore.isDirty(toMatch.key)) {
      return true;
    }

    const callbacks = tabDirtyStore.getCallbacks(toMatch.key);
    const decision = await tabDirtyStore.requestReplace(toMatch.key);

    if (decision === "cancel") {
      return false;
    }
    if (decision === "save") {
      try {
        await callbacks?.save();
      } catch (error) {
        console.error("Failed to save before replacing tab content:", error);
        return false;
      }
    } else {
      callbacks?.discard?.();
    }

    return true;
  });
};
