/**
 * Centralized configuration for all app tools/features
 * Defines availability, capabilities, and metadata for each tool
 * Single source of truth for icons, platform availability, and tool metadata
 */

import { Workspace, WordCloud } from "@vicons/carbon";
import {
  LayersOutline,
  CloudUploadOutline,
  ShareOutline,
  GridOutline,
  ListOutline,
  SearchOutline,
  CubeOutline,
  AnalyticsOutline,
  BriefcaseOutline,
  SquareOutline,
  SettingsOutline,
  DesktopOutline,
  EarthOutline,
  HomeOutline,
  MapOutline,
} from "@vicons/ionicons5";
import { RobotOutlined } from "@vicons/antd";
import { GrainOutlined } from "@vicons/material";

export const TOOL_AVAILABILITY = {
  DESKTOP_ONLY: "desktop",
  MOBILE_ONLY: "mobile",
  BOTH: "both",
};

/**
 * Icon registry: maps icon key strings to actual Vue icon components.
 * Used by useMainMenu, PhotoToolSelector, and any other UI that renders tool icons.
 */
export const TOOL_ICONS = {
  // Actual component names
  Workspace,
  LayersOutline,
  CloudUploadOutline,
  ShareOutline,
  GridOutline,
  ListOutline,
  SearchOutline,
  CubeOutline,
  AnalyticsOutline,
  BriefcaseOutline,
  SquareOutline,
  SettingsOutline,
  DesktopOutline,
  EarthOutline,
  WordCloud,
  GrainOutlined,
  RobotOutlined,
  HomeOutline,
  MapOutline,
};

export const TOOLS_CONFIG = [
  {
    id: "workspace",
    name: "Workspace",
    description: "View and manage all your photos",
    icon: "LayersOutline",
    route: "/workspace",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "library",
    showInPhotoSelector: false,
  },
  {
    id: "collections",
    name: "Collections",
    description: "Organize photos into collections",
    icon: "GridOutline",
    route: "/collections",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "library",
    showInPhotoSelector: false,
  },
  {
    id: "search",
    name: "Search",
    description: "Find photos using AI-powered search",
    dashboardName: "Search",
    dashboardSubtitle: "Find photos with AI semantic search",
    icon: "SearchOutline",
    route: "/search",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "explore",
    showInPhotoSelector: false,
  },
  {
    id: "report",
    name: "Report",
    description: "View analytics and insights",
    dashboardName: "Report & Statistics",
    dashboardSubtitle: "Track performance and visual trends",
    icon: "AnalyticsOutline",
    route: "/report",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "explore",
    showInPhotoSelector: false,
  },
  {
    id: "2d-atlas",
    name: "2D Atlas",
    description: "View photos in 2D space",
    icon: "GrainOutlined",
    route: "/2d-atlas",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "explore",
    showInPhotoSelector: true,
    singlePhotoOnly: true,
  },

  {
    id: "3d-atlas",
    name: "3D Atlas",
    description: "Navigate photos in 3D space",
    icon: "CubeOutline",
    route: "/3d-atlas",
    availableOn: TOOL_AVAILABILITY.DESKTOP_ONLY,
    menuSection: "explore",
    showInPhotoSelector: true,
    singlePhotoOnly: false,
  },
  {
    id: "tagcloud",
    name: "Tag Cloud",
    description: "Browse your tags clustered by semantic proximity",
    dashboardSubtitle: "Explore your tags by semantic proximity",
    dashboardBadgeNew: false,
    icon: "WordCloud",
    route: "/tagcloud",
    availableOn: TOOL_AVAILABILITY.DESKTOP_ONLY,
    menuSection: "explore",
    showInPhotoSelector: false,
    promo: true,
  },
  {
    id: "series",
    name: "Series",
    description: "Create photo sequences and stories",
    icon: "ListOutline",
    route: "/series",
    availableOn: TOOL_AVAILABILITY.DESKTOP_ONLY,
    menuSection: "create",
    showInPhotoSelector: false,
  },
  {
    id: "canvas",
    name: "Canvas",
    dashboardBadgeNew: false,
    // dashboardBadgeText: "+CHATLAB",
    description: "Create layouts and arrange photos",
    dashboardSubtitle: "Create and organize visual layouts",
    icon: "Workspace",
    route: "/canvas",
    availableOn: TOOL_AVAILABILITY.DESKTOP_ONLY,
    menuSection: "create",
    showInPhotoSelector: true,
    singlePhotoOnly: false,
  },
  {
    id: "framer",
    name: "Framer",
    description: "Add frames and borders to photos",
    icon: "SquareOutline",
    route: "/framer",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "create",
    showInPhotoSelector: true,
    singlePhotoOnly: false,
  },
  {
    id: "portfolios",
    name: "Create a Portfolio",
    description: "Showcase your best work in a beautiful portfolio",
    dashboardName: "Portfolios",
    dashboardSubtitle: "AI-powered portfolios",
    dashboardBadgeNew: false,
    icon: "BriefcaseOutline",
    route: "/portfolios",
    availableOn: TOOL_AVAILABILITY.DESKTOP_ONLY,
    menuSection: "create",
    showInPhotoSelector: false,
    promo: true,
  },
  {
    id: "chat",
    name: "Chat Lab",
    description: "Chat with AI about your photos",
    icon: "RobotOutlined",
    route: "/chat-lab",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "global",
    showInPhotoSelector: false,
  },
  {
    id: "import-area",
    name: "Import Area",
    description: "Upload and import photos",
    dashboardSubtitle: "Upload and process new photos",
    dashboardRoute: "/import-area#upload",
    icon: "ShareOutline",
    route: "/import-area",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "global",
    showInPhotoSelector: false,
  },
  {
    id: "settings",
    name: "Settings",
    description: "Configure app preferences",
    icon: "SettingsOutline",
    route: "/settings",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "system",
    showInPhotoSelector: false,
  },
  {
    id: "world-map",
    name: "World Map",
    description: "Visualize your photos on a world map",
    dashboardSubtitle: "Geotag your photos with AI",
    icon: "EarthOutline",
    route: "/world-map",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "global",
    showInPhotoSelector: false,
    dashboardBadgeNew: false,
    promo: true,
  },
];

/**
 * Helper to get tools available on a specific platform
 * @param {string} platform - 'mobile' or 'desktop'
 * @returns {Array} Filtered tools available on the platform
 */
export function getToolsForPlatform(platform) {
  return TOOLS_CONFIG.filter((tool) => {
    if (tool.availableOn === TOOL_AVAILABILITY.BOTH) return true;
    return tool.availableOn === platform;
  });
}

/**
 * Helper to get tools that should appear in PhotoToolSelector
 * @param {string} platform - 'mobile' or 'desktop'
 * @returns {Array} Filtered tools for the photo selector
 */
export function getPhotoSelectorTools(platform) {
  return TOOLS_CONFIG.filter((tool) => {
    // Must be available for photo selection
    if (!tool.showInPhotoSelector) return false;

    // Must be available on the current platform
    if (tool.availableOn === TOOL_AVAILABILITY.BOTH) return true;
    return tool.availableOn === platform;
  });
}

/**
 * Helper to get a specific tool by ID
 * @param {string} toolId - Tool identifier
 * @returns {Object|undefined} Tool configuration or undefined
 */
export function getToolById(toolId) {
  return TOOLS_CONFIG.find((tool) => tool.id === toolId);
}

/**
 * Check if a tool is available on a platform
 * @param {string} toolId - Tool identifier
 * @param {string} platform - 'mobile' or 'desktop'
 * @returns {boolean} Whether the tool is available
 */
export function isToolAvailable(toolId, platform) {
  const tool = getToolById(toolId);
  if (!tool) return false;

  if (tool.availableOn === TOOL_AVAILABILITY.BOTH) return true;
  return tool.availableOn === platform;
}

/**
 * Resolve an icon key string to its Vue component.
 * Falls back to Workspace if the key is unknown.
 * @param {string} iconKey - Icon key from TOOLS_CONFIG
 * @returns {Component} Vue icon component
 */
export function getIconComponent(iconKey) {
  return TOOL_ICONS[iconKey] || Workspace;
}

/**
 * Check if a tool is desktop-only
 * @param {string} toolId - Tool identifier
 * @returns {boolean}
 */
export function isDesktopOnly(toolId) {
  const tool = getToolById(toolId);
  return tool?.availableOn === TOOL_AVAILABILITY.DESKTOP_ONLY;
}

/**
 * Dashboard Smart Tools are intentionally curated and ordered.
 * @param {string} platform - 'mobile' or 'desktop'
 * @param {Object} [options]
 * @param {boolean} [options.includeChat] - Desktop only: surface the chat entry.
 * @param {boolean} [options.include2dAtlas] - Desktop only: surface the 2D Atlas entry. Defaults to true.
 * @returns {Array} Ordered tools for the dashboard smart tools section
 */
export function getDashboardSmartTools(platform, options = {}) {
  // On desktop, the chat and 2D Atlas tiles double as a way back to whatever
  // the center panel isn't currently showing — pointing at the panel already
  // on screen would be a no-op, so each one steps aside while it's visible there.
  const include2dAtlas = options.include2dAtlas !== false;
  const desktopToolIds = [
    ...(options.includeChat ? ["chat"] : []),
    ...(include2dAtlas ? ["2d-atlas"] : []),
    "canvas",
    "world-map",
    "portfolios",
  ];

  const orderedToolIds =
    platform === "mobile"
      ? ["chat", "world-map", "search", "report", "framer"]
      : desktopToolIds;

  return orderedToolIds
    .map((toolId) => getToolById(toolId))
    .filter(Boolean)
    .filter((tool) => {
      if (tool.availableOn === TOOL_AVAILABILITY.BOTH) return true;
      return tool.availableOn === platform;
    })
    .map((tool) => ({
      ...tool,
      dashboardName: tool.dashboardName || tool.name,
      dashboardSubtitle: tool.dashboardSubtitle || tool.description,
      dashboardRoute: tool.dashboardRoute || tool.route,
      dashboardBadgeText:
        tool.dashboardBadgeText || (tool.dashboardBadgeNew ? "NEW" : ""),
      dashboardBadgeNew: Boolean(
        tool.dashboardBadgeNew || tool.dashboardBadgeText,
      ),
    }));
}

/**
 * Get tools currently marked for promotion in the dashboard.
 * Set `promo: true` on any tool entry to surface it as a promo card.
 * @param {string} platform - 'mobile' or 'desktop'
 * @returns {Array} Tools with promo: true available on the given platform
 */
export function getPromoTools(platform) {
  return TOOLS_CONFIG.filter((tool) => {
    if (!tool.promo) return false;
    if (tool.availableOn === TOOL_AVAILABILITY.BOTH) return true;
    return tool.availableOn === platform;
  });
}
