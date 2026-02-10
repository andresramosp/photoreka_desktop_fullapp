import { computed, h, ref } from "vue";
import { NIcon } from "naive-ui";
import type { MenuOption } from "naive-ui";
import { usePhotosStore } from "@/stores/photos";
import { useCollectionsStore } from "@/stores/collections";
import { useSeriesStore } from "@/stores/series";
import { useRouter } from "vue-router";

// Centralized tool config: single source of truth for icons & availability
import { TOOL_ICONS, getToolById, isDesktopOnly } from "@/config/toolsConfig";
import { isMobileDevice } from "@/utils/utils";

// Section icons (menu-only, not tied to any tool)
import {
  LibraryOutline as LibraryIcon,
  CompassOutline as ExploreIcon,
  CreateOutline as CreateIcon,
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
  const isMobile = ref(window.innerWidth < 768);

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

  // Library Section
  const librarySection = computed<MenuOption>(() => {
    const children: MenuOption[] = [
      {
        label: () =>
          h("span", { class: "second-level-menu-item" }, "Workspace"),
        key: "workspace",
        icon: renderIcon(toolIcon("workspace")),
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

  // Explore Section
  const exploreSection = computed<MenuOption>(() => {
    const children: MenuOption[] = [
      {
        label: () => h("span", { class: "second-level-menu-item" }, "Search"),
        key: "search",
        disabled: isBlocked.value,
        icon: renderIcon(toolIcon("search")),
      },

      {
        label: () => h("span", { class: "second-level-menu-item" }, "Report"),
        key: "report",
        disabled: isBlocked.value,
        icon: renderIcon(toolIcon("report")),
      },
      {
        label: () => h("span", { class: "second-level-menu-item" }, "Atlas"),
        key: "atlas-group",
        disabled: isBlocked.value,
        icon: renderIcon(MapIcon),
        children: [
          {
            label: () =>
              h("span", { class: "collection-menu-item" }, "2D Atlas"),
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
      },
    ];

    return {
      label: "Explore",
      key: "explore-section",
      icon: renderIcon(ExploreIcon),
      children,
    };
  });

  // Create Section
  const createSection = computed<MenuOption>(() => {
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
                      // Close mobile menu after navigation
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
            {
              class: "second-level-menu-item",
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
      },
      {
        label: () => h("span", { class: "second-level-menu-item" }, "Framer"),
        key: "framer",
        disabled: isBlocked.value,
        icon: renderIcon(toolIcon("framer")),
      },
    ];

    return {
      label: "Create",
      key: "create-section",
      icon: renderIcon(CreateIcon),
      children,
    };
  });

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

  // Complete menu structure
  const menuOptions = computed<MenuOption[]>(() => {
    return [
      syncAreaOption.value,
      {
        type: "divider",
        key: "sync-divider",
      } as MenuOption,
      librarySection.value,
      exploreSection.value,
      createSection.value,
      {
        type: "divider",
        key: "create-divider",
      } as MenuOption,
      systemSection.value,
    ];
  });

  // Default expanded keys (Library section expanded by default)
  const defaultExpandedKeys = ref<string[]>(["library-section"]);

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
  };
}
