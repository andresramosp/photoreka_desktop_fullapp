import type { RouteLocationNormalizedLoaded } from "vue-router";

export type TabMode = "singleton" | "instance";
export type InstanceSource = "params" | "query";
export type TitleResolver =
  | "collection"
  | "series"
  | "canvas"
  | "portfolios"
  | "conversation";

export interface TabRouteConfig {
  key: string;
  toolId: string;
  routeName: string;
  mode: TabMode;
  title: string;
  /** Vue component name for KeepAlive include list */
  componentName?: string;
  titleResolver?: TitleResolver;
  instanceKey?: string;
  instanceSource?: InstanceSource;
  allowWithoutInstance?: boolean;
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
  // Chat instance tabs (one tab per conversation)
  {
    key: "chat-lab",
    toolId: "chat",
    routeName: "chat-lab-conversation",
    mode: "singleton",
    title: "ChatLab",
    componentName: "ChatView",
    titleResolver: "conversation",
    instanceKey: "id",
    instanceSource: "params",
  },

  // Singleton tabs (one tab per route)
  {
    key: "search",
    toolId: "search",
    routeName: "search",
    mode: "singleton",
    title: "Search",
    componentName: "SearchView",
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
    key: "2d-atlas",
    toolId: "2d-atlas",
    routeName: "2d-atlas",
    mode: "singleton",
    title: "2D Atlas",
    componentName: "2DView",
  },
  {
    key: "3d-atlas",
    toolId: "3d-atlas",
    routeName: "3d-atlas",
    mode: "singleton",
    title: "3D Atlas",
    componentName: "3DView",
  },
  {
    key: "tagcloud",
    toolId: "tagcloud",
    routeName: "tagcloud",
    mode: "singleton",
    title: "Tag Cloud",
    componentName: "TagCloudView",
  },
  //   {
  //     key: "workspace",
  //     routeName: "workspace",
  //     mode: "singleton",
  //     title: "Workspace",
  //   },
  //   {
  //     key: "settings",
  //     routeName: "settings",
  //     mode: "singleton",
  //     title: "Settings",
  //   },

  // Instance tabs (one tab per document)
  {
    key: "collection",
    toolId: "collections",
    routeName: "collection-detail",
    mode: "instance",
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
    mode: "instance",
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
    mode: "instance",
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
