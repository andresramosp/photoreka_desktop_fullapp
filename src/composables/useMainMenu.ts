import { computed, h, ref } from "vue";
import { NIcon } from "naive-ui";
import type { MenuOption } from "naive-ui";
import { usePhotosStore } from "@/stores/photos";
import { useCollectionsStore } from "@/stores/collections";
import { useSeriesStore } from "@/stores/series";
import { useUserStore } from "@/stores/userStore";
import { useRouter } from "vue-router";

// Centralized tool config: single source of truth for icons & availability
import { TOOL_ICONS, getToolById, isDesktopOnly } from "@/config/toolsConfig";
import { isMobileDevice } from "@/utils/utils";

// Section icons (menu-only, not tied to any tool)
import {
  LibraryOutline as LibraryIcon,
  ConstructOutline as SystemIcon,
  MapOutline as MapIcon,
} from "@vicons/ionicons5";

// Shorthand: resolve a tool's icon component from its config
const toolIcon = (toolId: string) => {
  const tool = getToolById(toolId);
  return tool ? TOOL_ICONS[tool.icon] : TOOL_ICONS.Workspace;
};

export function useMainMenu(closeMobileMenu?: () => void) {
  const router = useRouter();
  const photosStore = usePhotosStore();
  const collectionsStore = useCollectionsStore();
  const seriesStore = useSeriesStore();
  const userStore = useUserStore();
  const isMobile = ref(window.innerWidth < 768);

  // Check if user is demo
  const isDemoUser = computed(() => {
    return userStore.user?.email === "demo@photorekatest.com";
  });

  // Get real collections and series from stores
  const collections = computed(() =>
    collectionsStore.allCollections.map((col) => ({
      key: `collection-${col.id}`,
      label: col.title || col.name || `Collection ${col.id}`,
    })),
  );

  const series = computed(() =>
    seriesStore.allSeries.map((ser) => ({
      key: `series-${ser.id}`,
      label: ser.title || ser.name || `Series ${ser.id}`,
    })),
  );

  const appAccessMode = computed(() => photosStore.appAccessMode);
  const isBlocked = computed(() => appAccessMode.value === "blocked");

  // Helper to create icon render function
  const renderIcon = (icon: any) => {
    return () => h(NIcon, null, { default: () => h(icon) });
  };

  // Helper to render laptop icon suffix for desktop-only features
  const renderLaptopSuffix = () => {
    return () =>
      h(
        NIcon,
        { size: 16, style: { marginLeft: "auto", opacity: 0.5 } },
        { default: () => h(TOOL_ICONS.DesktopOutline) },
      );
  };

  // Check if a tool should be disabled on the current device.
  // Returns true when the tool is desktop-only AND the user is on mobile.
  const isToolDisabledOnMobile = (toolId: string) =>
    isDesktopOnly(toolId) && isMobileDevice();

  // Sync Area (global, outside sections)
  const syncAreaOption = computed<MenuOption>(() => ({
    label: "Sync Area",
    key: "sync-area",
    icon: renderIcon(toolIcon("sync-area")),
  }));

  // Workspace (root-level)
  const workspaceOption = computed<MenuOption>(() => ({
    label: "Workspace",
    key: "workspace",
    icon: renderIcon(toolIcon("workspace")),
  }));

  // Library Section
  const librarySection = computed<MenuOption>(() => {
    const children: MenuOption[] = [
      {
        label: () =>
          h(
            "span",
            {
              class: "second-level-menu-item",
              style: {
                display: "flex",
                alignItems: "center",
                width: "100%",
              },
            },
            [
              h(
                "span",
                {
                  onClick: (e: MouseEvent) => {
                    if (!isToolDisabledOnMobile("series")) {
                      e.stopPropagation();
                      router.push("/series");
                      if (isMobile.value && closeMobileMenu) {
                        closeMobileMenu();
                      }
                    }
                  },
                  style: {
                    cursor: isToolDisabledOnMobile("series")
                      ? "default"
                      : "pointer",
                    display: "inline-block",
                  },
                },
                "Series",
              ),
              isToolDisabledOnMobile("series") ? renderLaptopSuffix()() : null,
            ],
          ),
        key: "series-group",
        icon: renderIcon(toolIcon("series")),
        disabled: isToolDisabledOnMobile("series") || isBlocked.value,
        children:
          isToolDisabledOnMobile("series") || isBlocked.value
            ? undefined
            : series.value.map((ser) => ({
                label: () =>
                  h("span", { class: "collection-menu-item" }, ser.label),
                key: ser.key,
              })),
      },
      {
        label: () =>
          h(
            "span",
            { class: "second-level-menu-item" },
            h(
              "span",
              {
                onClick: (e: MouseEvent) => {
                  e.stopPropagation();
                  router.push("/collections");
                  // Close mobile menu after navigation
                  if (isMobile.value && closeMobileMenu) {
                    closeMobileMenu();
                  }
                },
                style: {
                  cursor: "pointer",
                  display: "inline-block",
                },
              },
              "Collections",
            ),
          ),
        key: "collections-group",
        icon: renderIcon(toolIcon("collections")),
        disabled: isBlocked.value,
        children: collections.value.map((col) => ({
          label: () => h("span", { class: "collection-menu-item" }, col.label),
          key: col.key,
        })),
      },
    ];

    return {
      label: "Library",
      key: "library-section",
      icon: renderIcon(LibraryIcon),
      children,
    };
  });

  // Search (root-level)
  const searchOption = computed<MenuOption>(() => ({
    label: "Search",
    key: "search",
    disabled: isBlocked.value,
    icon: renderIcon(toolIcon("search")),
  }));

  // Report (root-level)
  const reportOption = computed<MenuOption>(() => ({
    label: "Report",
    key: "report",
    disabled: isBlocked.value,
    icon: renderIcon(toolIcon("report")),
  }));

  // Atlas (root-level, with 2D/3D children)
  const atlasOption = computed<MenuOption>(() => ({
    label: "Atlas",
    key: "atlas-group",
    disabled: isBlocked.value,
    icon: renderIcon(MapIcon),
    children: [
      {
        label: () => h("span", { class: "collection-menu-item" }, "2D Atlas"),
        key: "2d-view",
        icon: renderIcon(toolIcon("2d-view")),
      },
      {
        label: () =>
          h(
            "span",
            {
              class: "collection-menu-item",
              style: {
                display: "flex",
                alignItems: "center",
                width: "100%",
              },
            },
            [
              h("span", "3D Atlas"),
              isToolDisabledOnMobile("3d-atlas")
                ? renderLaptopSuffix()()
                : null,
            ],
          ),
        key: "atlas",
        icon: renderIcon(toolIcon("3d-atlas")),
        disabled: isToolDisabledOnMobile("3d-atlas") || isBlocked.value,
      },
    ],
  }));

  // Canvas (root-level)
  const canvasOption = computed<MenuOption>(() => ({
    label: () =>
      h(
        "span",
        {
          style: {
            display: "flex",
            alignItems: "center",
            width: "100%",
          },
        },
        [
          h("span", "Canvas"),
          isToolDisabledOnMobile("canvas") ? renderLaptopSuffix()() : null,
        ],
      ),
    key: "canvas",
    disabled: isToolDisabledOnMobile("canvas") || isBlocked.value,
    icon: renderIcon(toolIcon("canvas")),
  }));

  // Framer (root-level)
  const framerOption = computed<MenuOption>(() => ({
    label: "Framer",
    key: "framer",
    disabled: isBlocked.value,
    icon: renderIcon(toolIcon("framer")),
  }));

  // System Section
  const systemSection = computed<MenuOption>(() => ({
    label: "System",
    key: "system-section",
    icon: renderIcon(SystemIcon),
    children: [
      {
        label: () => h("span", { class: "second-level-menu-item" }, "Settings"),
        key: "settings",
        icon: renderIcon(toolIcon("settings")),
      },
      {
        label: () => h("span", { class: "second-level-menu-item" }, "Help"),
        key: "help",
        icon: renderIcon(toolIcon("help")),
      },
    ],
  }));

  // Chat option (global, like Sync Area)
  const chatOption = computed<MenuOption>(() => ({
    label: "ChatLab",
    key: "chat-lab",
    icon: renderIcon(toolIcon("chat")),
    disabled: false,
  }));

  // Complete menu structure
  const menuOptions = computed<MenuOption[]>(() => {
    return [
      syncAreaOption.value,
      {
        type: "divider",
        key: "sync-divider",
      } as MenuOption,
      workspaceOption.value,

      librarySection.value,
      {
        type: "divider",
        key: "group1-divider",
      } as MenuOption,
      searchOption.value,
      atlasOption.value,
      ,
      canvasOption.value,

      chatOption.value,
      reportOption.value,
      {
        type: "divider",
        key: "tools-divider",
      } as MenuOption,
      framerOption.value,
      {
        type: "divider",
        key: "chat-divider",
      } as MenuOption,
      systemSection.value,
    ];
  });

  // Default expanded keys (Library section expanded by default)
  const defaultExpandedKeys = ref<string[]>([]);

  // Determine if top-level collapsible sections are mutually exclusive (accordion mode)
  const exclusiveMenuMode = ref(true);

  const updateIsMobile = () => {
    isMobile.value = window.innerWidth < 768;
  };

  return {
    menuOptions,
    defaultExpandedKeys,
    isMobile,
    updateIsMobile,
    collections,
    series,
    exclusiveMenuMode,
    isDemoUser,
  };
}
