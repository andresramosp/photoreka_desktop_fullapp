import type { RouteLocationNormalizedLoaded } from "vue-router";

export type TabMode = "singleton" | "instance";
export type InstanceSource = "params" | "query";
export type TitleResolver =
  | "collection"
  | "series"
  | "canvas"
  | "portfolios"
  | "conversation"
  | "search";

export interface TabRouteConfig {
  key: string;
  /** null for tabs that aren't a tool (Home) — drives the tab icon and purges */
  toolId: string | null;
  routeName: string;
  mode: TabMode;
  title: string;
  /** Vue component name for KeepAlive include list */
  componentName?: string;
  titleResolver?: TitleResolver;
  instanceKey?: string;
  instanceSource?: InstanceSource;
  allowWithoutInstance?: boolean;
  /** TOOL_ICONS key, for tabs with no toolId to borrow an icon from */
  icon?: string;
  /** Render the app's imagotype instead of an icon */
  logo?: boolean;
  /** Always open, always first, no close button */
  pinned?: boolean;
}

export interface TabRouteMatch {
  config: TabRouteConfig;
  key: string;
  instanceId: string | null;
}

export const ROUTE_TABS_PURGE_INSTANCES_EVENT = "route-tabs:purge-instances";

export type RouteTabsPurgeDetail = {
  toolId: string;
  instanceIds: Array<string | number>;
};

export const ROUTE_TABS_CONFIG: TabRouteConfig[] = [
  // Home — the dashboard is the app's control center (and hosts the chat), so
  // its tab is always open and can't be closed.
  {
    key: "home",
    toolId: null,
    routeName: "dashboard",
    mode: "singleton",
    title: "Home",
    componentName: "DashboardView",
    logo: true,
    pinned: true,
  },

  // Singleton tabs (one tab per route)
  {
    key: "search",
    toolId: "search",
    routeName: "search",
    mode: "singleton",
    title: "Search",
    componentName: "SearchView",
    titleResolver: "search",
  },
  {
    key: "report",
    toolId: "report",
    routeName: "report",
    mode: "singleton",
    title: "Report",
  },
  {
    key: "world-map",
    toolId: "world-map",
    routeName: "world-map",
    mode: "singleton",
    title: "World Map",
    componentName: "WorldMapView",
  },
  {
    key: "atlas",
    toolId: "2d-atlas",
    routeName: "atlas",
    mode: "singleton",
    title: "Atlas",
    componentName: "AtlasView",
  },
  {
    key: "tagcloud",
    toolId: "tagcloud",
    routeName: "tagcloud",
    mode: "singleton",
    title: "Tag Cloud",
    componentName: "TagCloudView",
  },
  {
    key: "workspace",
    toolId: "workspace",
    routeName: "workspace",
    mode: "singleton",
    title: "Workspace",
  },
  //   {
  //     key: "settings",
  //     routeName: "settings",
  //     mode: "singleton",
  //     title: "Settings",
  //   },

  // Instance tabs (one tab per document)
  // Collections reuse a single tab: opening another collection replaces the one
  // already open (same contract as Canvas), so the tab bar can't fill up with them.
  {
    key: "collection",
    toolId: "collections",
    routeName: "collection-detail",
    mode: "singleton",
    title: "Collection",
    componentName: "CollectionDetailView",
    titleResolver: "collection",
    instanceKey: "id",
    instanceSource: "params",
  },
  {
    key: "series",
    toolId: "series",
    routeName: "series-detail",
    mode: "singleton",
    title: "Series",
    componentName: "SeriesView",
    titleResolver: "series",
    instanceKey: "id",
    instanceSource: "params",
  },
  {
    key: "portfolios",
    toolId: "portfolios",
    routeName: "portfolio-detail",
    mode: "singleton",
    title: "Portfolios",
    componentName: "PortfolioDetailView",
    titleResolver: "portfolios",
    instanceKey: "id",
    instanceSource: "params",
  },
  {
    key: "canvas",
    toolId: "canvas",
    routeName: "canvas",
    mode: "singleton",
    title: "Canvas",
    componentName: "CanvasView",
    titleResolver: "canvas",
    instanceKey: "canvasId",
    instanceSource: "params",
  },
  {
    key: "framer",
    toolId: "framer",
    routeName: "framer",
    mode: "singleton",
    title: "Framer",
    componentName: "FramerView",
  },
];

const getFirstValue = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    const first = value[0];
    return first != null ? String(first) : null;
  }
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeInstanceIds = (ids: Array<string | number>): string[] => {
  const normalized = ids
    .map((id) => String(id).trim())
    .filter((id) => id.length > 0);
  return Array.from(new Set(normalized));
};

export const emitRouteTabsInstancePurge = (
  toolId: string,
  instanceIds: Array<string | number>,
) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedToolId = String(toolId).trim();
  if (!normalizedToolId) {
    return;
  }

  const normalizedIds = normalizeInstanceIds(instanceIds);
  if (!normalizedIds.length) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<RouteTabsPurgeDetail>(ROUTE_TABS_PURGE_INSTANCES_EVENT, {
      detail: {
        toolId: normalizedToolId,
        instanceIds: normalizedIds,
      },
    }),
  );
};

const getInstanceId = (
  route: RouteLocationNormalizedLoaded,
  config: TabRouteConfig,
): string | null => {
  if (!config.instanceKey || !config.instanceSource) {
    return null;
  }

  const source =
    config.instanceSource === "params" ? route.params : route.query;
  return getFirstValue(source[config.instanceKey]);
};

export const matchRouteToTab = (
  route: RouteLocationNormalizedLoaded,
): TabRouteMatch | null => {
  const routeName = typeof route.name === "string" ? route.name : null;
  if (!routeName) {
    return null;
  }

  const config = ROUTE_TABS_CONFIG.find(
    (entry) => entry.routeName === routeName,
  );
  if (!config) {
    return null;
  }

  const instanceId = getInstanceId(route, config);

  if (config.mode === "singleton") {
    return {
      config,
      key: config.key,
      instanceId,
    };
  }

  if (!instanceId && !config.allowWithoutInstance) {
    return null;
  }

  return {
    config,
    key: instanceId ? `${config.key}:${instanceId}` : `${config.key}:default`,
    instanceId,
  };
};

export const getFallbackTabTitle = (match: TabRouteMatch): string => {
  if (!match.instanceId) {
    return match.config.title;
  }
  return `${match.config.title} ${match.instanceId}`;
};

export const getTabToolIdByRouteName = (routeName: string): string | null => {
  const config = ROUTE_TABS_CONFIG.find(
    (entry) => entry.routeName === routeName,
  );
  return config?.toolId || null;
};

export const getTabConfigByRouteName = (
  routeName: string,
): TabRouteConfig | null =>
  ROUTE_TABS_CONFIG.find((entry) => entry.routeName === routeName) ?? null;

/**
 * Tab key a view should use to register itself (dirty state, etc.).
 * Singleton tabs keep a static key no matter which entity they hold, so views
 * must not build `key:id` by hand — that would stop matching the open tab.
 */
export const getTabKeyForInstance = (
  routeName: string,
  instanceId: string | number | null | undefined,
): string | null => {
  const config = getTabConfigByRouteName(routeName);
  if (!config) {
    return null;
  }
  if (config.mode === "singleton") {
    return config.key;
  }
  const normalized = instanceId != null ? String(instanceId).trim() : "";
  return normalized.length > 0 ? `${config.key}:${normalized}` : null;
};

/** Tabs that are seeded on load and never closed. */
export const PINNED_TAB_CONFIGS = ROUTE_TABS_CONFIG.filter(
  (entry) => entry.pinned,
);
