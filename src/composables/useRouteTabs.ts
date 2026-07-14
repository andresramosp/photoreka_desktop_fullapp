import {
  computed,
  defineComponent,
  h,
  markRaw,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import type { RouteLocationNormalizedLoaded } from "vue-router";
import { api } from "@/utils/axios";
import { useCollectionsStore } from "@/stores/collections";
import { useSeriesStore } from "@/stores/series";
import { useChatStore } from "@/stores/chat";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";
import { useSearchStore } from "@/stores/searchStore";
import {
  getFallbackTabTitle,
  getTabConfigByRouteName,
  getTabToolIdByRouteName,
  matchRouteToTab,
  PINNED_TAB_CONFIGS,
  ROUTE_TABS_CONFIG,
  ROUTE_TABS_PURGE_INSTANCES_EVENT,
  type RouteTabsPurgeDetail,
  type TabRouteMatch,
} from "@/config/routeTabs";
import { useTabDirtyStore } from "@/stores/tabDirtyStore";

export type OpenRouteTab = {
  key: string;
  title: string;
  href: string;
  routeName: string;
  toolId: string | null;
  closable: boolean;
  /** TOOL_ICONS key for tabs with no toolId to draw an icon from */
  icon?: string;
  /** Render the app's imagotype instead of an icon */
  logo?: boolean;
  pinned?: boolean;
};

type PersistedRouteTab = {
  key: string;
  title: string;
  href: string;
  routeName: string;
  toolId?: string | null;
};

const STORAGE_KEY = "photoreka-route-tabs-v1";

const safeGetStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
};

const getInstanceIdFromTabKey = (key: string): string | null => {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const raw = key.slice(separatorIndex + 1).trim();
  if (!raw || raw === "default") {
    return null;
  }

  return raw;
};

// Shared module-level state — all composable instances reference the same refs.
// This allows App.vue and DashboardHeader to read/write the same tab list.
const tabs = ref<OpenRouteTab[]>([]);
const activeTabKey = ref<string | null>(null);
const canvasNameCache = new Map<string, string>();
let _tabsLoaded = false;
let _listenersRegistered = false;

// ---------------------------------------------------------------------------
// KeepAlive helpers (module-level so wrapper identity is stable across renders)
// ---------------------------------------------------------------------------

/** Views that stay cached unconditionally, regardless of open tabs. */
const ALWAYS_ALIVE_COMPONENTS = [
  "WorkspaceView",
  "DashboardView",
  "ImportAreaView",
  "FramerView",
];

/**
 * Per-tab wrapper components for instance routes (collection, series, etc.).
 * Each open tab gets a unique wrapper so KeepAlive can evict it individually
 * when that specific tab is closed, without affecting other same-type tabs.
 */
const instanceKeepAliveWrappers = new Map<string, ReturnType<typeof markRaw>>();

const sanitizeForComponentName = (value: string) =>
  value.replace(/[^a-zA-Z0-9_]/g, "_");

const getInstanceWrapperName = (tabKey: string) =>
  `RouteInstance_${sanitizeForComponentName(tabKey)}`;

/**
 * Returns the component to render inside KeepAlive.
 * - For instance routes: returns a thin named wrapper so each tab key maps to a
 *   unique cache slot — closing one collection tab won't evict another.
 * - For all other routes: passes the component through unchanged.
 */
export const getKeepAliveComponent = (
  component: object,
  currentRoute: RouteLocationNormalizedLoaded,
): object => {
  const tabMatch = matchRouteToTab(currentRoute);
  if (tabMatch?.config.mode !== "instance") {
    return component;
  }

  const existing = instanceKeepAliveWrappers.get(tabMatch.key);
  if (existing) {
    return existing;
  }

  const wrapper = markRaw(
    defineComponent({
      name: getInstanceWrapperName(tabMatch.key),
      setup() {
        return () => h(component as Parameters<typeof h>[0]);
      },
    }),
  );

  instanceKeepAliveWrappers.set(tabMatch.key, wrapper);
  return wrapper;
};

/**
 * Reactive list of component names to pass to <KeepAlive :include>.
 * Recalculated whenever tabs change so closing a tab immediately removes
 * its component from the cache.
 */
export const keepAliveComponents = computed(() => {
  const fromTabs = tabs.value
    .map((tab) => {
      const config = ROUTE_TABS_CONFIG.find(
        (c) => c.routeName === tab.routeName,
      );
      if (!config) {
        return null;
      }
      if (config.mode === "instance") {
        return getInstanceWrapperName(tab.key);
      }
      return config.componentName ?? null;
    })
    .filter((name): name is string => name !== null);

  return Array.from(new Set([...ALWAYS_ALIVE_COMPONENTS, ...fromTabs]));
});

// Clean up wrapper references for tabs that have been closed.
watch(
  () => tabs.value.map((tab) => tab.key),
  (keys) => {
    const liveKeys = new Set(keys);
    for (const tabKey of instanceKeepAliveWrappers.keys()) {
      if (!liveKeys.has(tabKey)) {
        instanceKeepAliveWrappers.delete(tabKey);
      }
    }
  },
  { immediate: true },
);

export const useRouteTabs = () => {
  const route = useRoute();
  const router = useRouter();
  const collectionsStore = useCollectionsStore();
  const seriesStore = useSeriesStore();
  const chatStore = useChatStore();
  const portfolioBuildsStore = usePortfolioBuildsStore();
  const searchStore = useSearchStore();
  const tabDirtyStore = useTabDirtyStore();

  /** Pinned tabs are seeded from config on every load, never from storage. */
  const ensurePinnedTabs = () => {
    PINNED_TAB_CONFIGS.forEach((config, index) => {
      if (tabs.value.some((tab) => tab.key === config.key)) {
        return;
      }

      tabs.value.splice(index, 0, {
        key: config.key,
        title: config.title,
        href: router.resolve({ name: config.routeName }).fullPath,
        routeName: config.routeName,
        toolId: config.toolId,
        closable: false,
        icon: config.icon,
        logo: config.logo,
        pinned: true,
      });
    });
  };

  const loadPersistedTabs = () => {
    const storage = safeGetStorage();
    if (!storage) {
      return;
    }

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as PersistedRouteTab[];
      if (!Array.isArray(parsed)) {
        return;
      }

      tabs.value = parsed
        .filter((entry) => entry && typeof entry.key === "string")
        // Drop tabs whose route no longer exists in the config (e.g. the chat
        // tabs that predate the dashboard-hosted chat), so they can't linger
        // as dead entries pointing at routes we no longer open.
        .filter((entry) => !!getTabConfigByRouteName(entry.routeName))
        .map((entry) => ({
          key: entry.key,
          title: entry.title,
          href: entry.href,
          routeName: entry.routeName,
          toolId: entry.toolId ?? getTabToolIdByRouteName(entry.routeName),
          closable: true,
        }));
    } catch (error) {
      console.error("Failed to restore route tabs:", error);
    }
  };

  const persistTabs = () => {
    const storage = safeGetStorage();
    if (!storage) {
      return;
    }

    const payload: PersistedRouteTab[] = tabs.value
      // Pinned tabs are re-seeded from config on load, so they never persist.
      .filter((tab) => !tab.pinned)
      .map((tab) => ({
        key: tab.key,
        title: tab.title,
        href: tab.href,
        routeName: tab.routeName,
        toolId: tab.toolId,
      }));
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  };

  const ensureCollectionsLoaded = async () => {
    if (!collectionsStore.hasBeenLoaded) {
      await collectionsStore.getOrFetch();
    }
  };

  const ensureSeriesLoaded = async () => {
    if (!seriesStore.hasBeenLoaded) {
      await seriesStore.getOrFetch();
    }
  };

  const resolveCanvasName = async (
    canvasId: string,
  ): Promise<string | null> => {
    if (canvasNameCache.has(canvasId)) {
      return canvasNameCache.get(canvasId) || null;
    }

    try {
      const response = await api.get("/api/canvas");
      const list = Array.isArray(response.data) ? response.data : [];
      for (const canvas of list) {
        if (canvas?.id != null && canvas?.name) {
          canvasNameCache.set(String(canvas.id), String(canvas.name));
        }
      }
      return canvasNameCache.get(canvasId) || null;
    } catch (error) {
      console.error("Failed to resolve canvas tab name:", error);
      return null;
    }
  };

  const resolveTabTitle = async (match: TabRouteMatch): Promise<string> => {
    const fallbackTitle = getFallbackTabTitle(match);

    if (!match.config.titleResolver) {
      return fallbackTitle;
    }

    if (match.config.titleResolver === "search") {
      const query = (searchStore.currentSearchState?.query || "").trim();
      if (!query) {
        return match.config.title;
      }
      return query.charAt(0).toUpperCase() + query.slice(1);
    }

    if (!match.instanceId) {
      return fallbackTitle;
    }

    try {
      if (match.config.titleResolver === "collection") {
        await ensureCollectionsLoaded();
        const collection = collectionsStore.getCollectionById(match.instanceId);
        return (
          collection?.title ||
          collection?.name ||
          `${match.config.title} ${match.instanceId}`
        );
      }

      if (match.config.titleResolver === "series") {
        await ensureSeriesLoaded();
        const series = seriesStore.getSeriesById(match.instanceId);
        return (
          series?.title ||
          series?.name ||
          `${match.config.title} ${match.instanceId}`
        );
      }

      if (match.config.titleResolver === "canvas") {
        if (!match.instanceId) {
          return match.config.title;
        }
        const canvasName = await resolveCanvasName(match.instanceId);
        return canvasName || `${match.config.title} ${match.instanceId}`;
      }

      if (match.config.titleResolver === "portfolios") {
        if (!portfolioBuildsStore.hasBeenLoaded) {
          await portfolioBuildsStore.fetchBuilds();
        }
        const build = portfolioBuildsStore.allBuilds.find(
          (b: { id: number; config?: { name?: string } }) =>
            String(b.id) === match.instanceId,
        );
        return (
          build?.config?.name || `${match.config.title} ${match.instanceId}`
        );
      }

      if (match.config.titleResolver === "conversation") {
        if (
          !chatStore.conversations.length &&
          !chatStore.isLoadingConversations
        ) {
          await chatStore.fetchConversations();
        }
        const conv = chatStore.conversations.find(
          (c: { id: number; title: string | null }) =>
            String(c.id) === match.instanceId,
        );
        return conv?.title || `${match.config.title} ${match.instanceId}`;
      }
    } catch (error) {
      console.error("Failed to resolve route tab title:", error);
    }

    return fallbackTitle;
  };

  const upsertTabFromCurrentRoute = async () => {
    const match = matchRouteToTab(route);

    if (!match) {
      activeTabKey.value = null;
      return;
    }

    activeTabKey.value = match.key;
    const routeName = String(route.name || "");
    const href = route.fullPath;
    const fallbackTitle = getFallbackTabTitle(match);

    const existingIndex = tabs.value.findIndex((tab) => tab.key === match.key);
    if (existingIndex === -1) {
      tabs.value.push({
        key: match.key,
        title: fallbackTitle,
        href,
        routeName,
        toolId: match.config.toolId,
        closable: !match.config.pinned,
        icon: match.config.icon,
        logo: match.config.logo,
        pinned: match.config.pinned,
      });
    } else {
      tabs.value[existingIndex].href = href;
      tabs.value[existingIndex].routeName = routeName;
      tabs.value[existingIndex].toolId = match.config.toolId;
      if (!tabs.value[existingIndex].title) {
        tabs.value[existingIndex].title = fallbackTitle;
      }
    }

    const resolvedTitle = await resolveTabTitle(match);
    const tab = tabs.value.find((entry) => entry.key === match.key);
    if (tab) {
      tab.title = resolvedTitle;
      persistTabs();
    }
  };

  const openTab = async (key: string) => {
    const tab = tabs.value.find((entry) => entry.key === key);
    if (!tab) {
      return;
    }
    await router.push(tab.href);
  };

  const isPinned = (key: string) =>
    tabs.value.some((tab) => tab.key === key && tab.pinned);

  const closeTab = async (key: string) => {
    if (isPinned(key)) {
      return;
    }
    if (tabDirtyStore.isDirty(key)) {
      tabDirtyStore.requestClose(key);
      return;
    }
    await _doCloseTab(key);
  };

  const moveTab = (
    fromKey: string,
    toKey: string,
    position: "before" | "after" = "before",
  ) => {
    if (!fromKey || !toKey || fromKey === toKey) {
      return false;
    }

    // Pinned tabs hold the front of the bar: they can't be dragged, and nothing
    // can be dropped ahead of them.
    if (isPinned(fromKey)) {
      return false;
    }

    const fromIndex = tabs.value.findIndex((entry) => entry.key === fromKey);
    const toIndex = tabs.value.findIndex((entry) => entry.key === toKey);
    if (fromIndex === -1 || toIndex === -1) {
      return false;
    }

    const [moved] = tabs.value.splice(fromIndex, 1);
    const adjustedToIndex =
      fromIndex < toIndex ? Math.max(toIndex - 1, 0) : toIndex;
    const insertIndex =
      position === "after" ? adjustedToIndex + 1 : adjustedToIndex;
    const firstUnpinnedIndex = tabs.value.filter((tab) => tab.pinned).length;
    tabs.value.splice(Math.max(insertIndex, firstUnpinnedIndex), 0, moved);
    persistTabs();
    return true;
  };

  const _doCloseTab = async (key: string) => {
    const index = tabs.value.findIndex((entry) => entry.key === key);
    if (index === -1 || tabs.value[index].pinned) {
      return;
    }

    const wasActive = activeTabKey.value === key;
    tabs.value.splice(index, 1);
    persistTabs();

    if (!wasActive) {
      return;
    }

    const nextTab = tabs.value[index] || tabs.value[index - 1];
    if (nextTab) {
      await router.push(nextTab.href);
      return;
    }

    await router.push({ name: "dashboard" });
  };

  const removeTabsByPredicate = async (
    predicate: (tab: OpenRouteTab) => boolean,
  ) => {
    const currentTabs = tabs.value;
    const removedTabs = currentTabs.filter(predicate);
    if (!removedTabs.length) {
      return;
    }

    const removedKeys = new Set(removedTabs.map((tab) => tab.key));
    const activeKey = activeTabKey.value;
    const activeIndex = activeKey
      ? currentTabs.findIndex((tab) => tab.key === activeKey)
      : -1;
    const activeWasRemoved = !!activeKey && removedKeys.has(activeKey);

    tabs.value = currentTabs.filter((tab) => !removedKeys.has(tab.key));
    removedKeys.forEach((key) => {
      tabDirtyStore.unregister(key);
    });
    persistTabs();

    if (!activeWasRemoved) {
      return;
    }

    const nextTab =
      tabs.value[activeIndex] ||
      (activeIndex > 0 ? tabs.value[activeIndex - 1] : null);
    if (nextTab) {
      await router.push(nextTab.href);
      return;
    }

    activeTabKey.value = null;
    await router.push({ name: "dashboard" });
  };

  const purgeInstanceTabs = async (
    toolId: string,
    instanceIds: Array<string | number>,
  ) => {
    const normalizedToolId = String(toolId).trim();
    if (!normalizedToolId) {
      return;
    }

    const idSet = new Set(
      instanceIds.map((id) => String(id).trim()).filter((id) => id.length > 0),
    );
    if (!idSet.size) {
      return;
    }

    await removeTabsByPredicate((tab) => {
      if (tab.toolId !== normalizedToolId) {
        return false;
      }

      const tabInstanceId = getInstanceIdFromTabKey(tab.key);
      return !!tabInstanceId && idSet.has(tabInstanceId);
    });
  };

  const handlePurgeEvent = async (event: Event) => {
    const customEvent = event as CustomEvent<RouteTabsPurgeDetail>;
    const detail = customEvent.detail;
    if (!detail) {
      return;
    }

    await purgeInstanceTabs(detail.toolId, detail.instanceIds || []);
  };

  // Closes a tab bypassing the dirty check (call after user confirms)
  const forceCloseTab = async (key: string) => {
    tabDirtyStore.unregister(key);
    tabDirtyStore.clearPendingClose();
    await _doCloseTab(key);
  };

  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    const dirtyCount = tabDirtyStore.dirtyTabKeys.size;
    if (dirtyCount === 0) {
      return;
    }
    const message =
      dirtyCount === 1
        ? "You have unsaved changes in 1 tab. If you leave, your changes will be lost."
        : `You have unsaved changes in ${dirtyCount} tabs. If you leave, your changes will be lost.`;
    event.preventDefault();
    event.returnValue = message;
    return message;
  };

  if (!_tabsLoaded) {
    loadPersistedTabs();
    ensurePinnedTabs();
    _tabsLoaded = true;
  }

  onMounted(() => {
    if (!_listenersRegistered) {
      _listenersRegistered = true;
      window.addEventListener(
        ROUTE_TABS_PURGE_INSTANCES_EVENT,
        handlePurgeEvent,
      );
      window.addEventListener("beforeunload", handleBeforeUnload);
    }
  });

  onUnmounted(() => {
    // Only the component that registered the listeners should remove them.
    // We keep listeners alive as long as any composable caller is mounted.
    // App.vue is always mounted so this is effectively never removed during use.
  });

  watch(
    () => route.fullPath,
    () => {
      upsertTabFromCurrentRoute();
    },
    { immediate: true },
  );

  // The search tab's title tracks the live query text, which changes without
  // a route navigation (it lives in the search store, not the URL) — so it
  // needs its own watcher rather than piggybacking on route.fullPath above.
  watch(
    () => searchStore.currentSearchState?.query,
    () => {
      if (activeTabKey.value === "search") {
        upsertTabFromCurrentRoute();
      }
    },
  );

  watch(
    tabs,
    () => {
      persistTabs();
    },
    { deep: true },
  );

  return {
    tabs,
    activeTabKey,
    openTab,
    closeTab,
    forceCloseTab,
    moveTab,
    purgeInstanceTabs,
  };
};
