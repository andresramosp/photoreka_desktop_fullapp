/**
 * Centralized configuration for all app tools/features
 * Defines availability, capabilities, and metadata for each tool
 * Single source of truth for icons, platform availability, and tool metadata
 */

import { Workspace } from "@vicons/carbon";
import {
  LayersOutline,
  CloudUploadOutline,
  GridOutline,
  ListOutline,
  SearchOutline,
  CubeOutline,
  AnalyticsOutline,
  SquareOutline,
  SettingsOutline,
  HelpCircleOutline,
  Image,
  DesktopOutline,
} from "@vicons/ionicons5";

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
  GridOutline,
  ListOutline,
  SearchOutline,
  CubeOutline,
  AnalyticsOutline,
  SquareOutline,
  SettingsOutline,
  HelpCircleOutline,
  Image,
  DesktopOutline,
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
    icon: "AnalyticsOutline",
    route: "/report",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "explore",
    showInPhotoSelector: false,
  },
  {
    id: "2d-view",
    name: "2D Atlas",
    description: "View photos in 2D space",
    icon: "Image",
    route: "/2d-view",
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
    route: "/atlas",
    availableOn: TOOL_AVAILABILITY.DESKTOP_ONLY,
    menuSection: "explore",
    showInPhotoSelector: true,
    singlePhotoOnly: false,
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
    description: "Create layouts and arrange photos",
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
    id: "sync-area",
    name: "Sync Area",
    description: "Upload and sync photos",
    icon: "CloudUploadOutline",
    route: "/sync-area",
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
    id: "help",
    name: "Help",
    description: "Get help and tutorials",
    icon: "HelpCircleOutline",
    route: "/help",
    availableOn: TOOL_AVAILABILITY.BOTH,
    menuSection: "system",
    showInPhotoSelector: false,
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
