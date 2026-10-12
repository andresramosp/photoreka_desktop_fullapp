import { isDemoEmail } from "@/config/demoUsers";
import { computed, h, onMounted, onUnmounted, ref, watch } from "vue";
import { NEllipsis, NIcon } from "naive-ui";
import type { MenuOption } from "naive-ui";
import { usePhotosStore } from "@/stores/photos";
import { useCollectionsStore } from "@/stores/collections";
import { useSeriesStore } from "@/stores/series";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";
import { useUserStore } from "@/stores/userStore";
import { useRouter } from "vue-router";
import { api } from "@/utils/axios";

// Centralized tool config: single source of truth for icons & availability
import { TOOL_ICONS, getToolById, isDesktopOnly } from "@/config/toolsConfig";
import { isMobileDevice } from "@/utils/utils";

// Section icons (menu-only, not tied to any tool)
import {
  LibraryOutline as LibraryIcon,
  MapOutline as MapIcon,
  FolderOutline as FolderIcon,
} from "@vicons/ionicons5";

// Shorthand: resolve a tool's icon component from its config
const toolIcon = (toolId: string) => {
  const tool = getToolById(toolId);
  return tool ? TOOL_ICONS[tool.icon] : TOOL_ICONS.Workspace;
};

type MenuLeafItem = {
  key: string;
  label: string;
};

export function useMainMenu(
  closeMobileMenu?: () => void,
  // True while the sidebar renders its collapsed (icons-only) form. In that
  // state the menu labels are hidden, so their click handlers never fire.
  isMenuCollapsed?: () => boolean,
) {
  const router = useRouter();
  const photosStore = usePhotosStore();
  const collectionsStore = useCollectionsStore();
  const seriesStore = useSeriesStore();
  const portfolioBuildsStore = usePortfolioBuildsStore();
  const userStore = useUserStore();
  const isMobile = ref(window.innerWidth < 768);

  // Check if user is demo
  const isDemoUser = computed(() => {
    return isDemoEmail(userStore.user?.email);
  });

  const canvasList = ref<Array<{ id: number | string; name?: string }>>([]);

  const loadCanvasList = async () => {
    if (!userStore.isAuthenticated) {
      canvasList.value = [];
      return;
    }

    try {
      const res = await api.get("/api/canvas");
      canvasList.value = res.data || [];
    } catch (error) {
      console.error("Error loading canvases for sidebar menu:", error);
      canvasList.value = [];
    }
  };

  const handleCanvasListUpdated = () => {
    loadCanvasList();
  };

  watch(
    () => userStore.isAuthenticated,
    (isAuthenticated) => {
      if (isAuthenticated) {
        loadCanvasList();
      } else {
        canvasList.value = [];
      }
    },
    { immediate: true },
  );

  onMounted(() => {
    window.addEventListener("canvas:list-updated", handleCanvasListUpdated);
  });

  onUnmounted(() => {
    window.removeEventListener("canvas:list-updated", handleCanvasListUpdated);
  });

  // Get real collections and series from stores
  // (kept for series; collections are now rendered as a full tree)
  const collections = computed<MenuLeafItem[]>(() =>
    collectionsStore.allCollections.map(
      (col: { id: string | number; title?: string; name?: string }) => ({
        key: `collection-${col.id}`,
        label: col.title || col.name || `Collection ${col.id}`,
      }),
    ),
  );

  /**
   * Build menu children for a set node recursively.
   * child sets come first, then collections inside the set.
   */
  const buildSetChildren = (setId: string | number): MenuOption[] => {
    const childSets: MenuOption[] = collectionsStore
      .childSetsOf(setId)
      .map((s: { id: string | number; name?: string }) => ({
        label: () => renderTruncatedLabel(s.name || `Set ${s.id}`),
        key: `collection-set-${s.id}`,
        icon: renderIcon(FolderIcon),
        children: buildSetChildren(s.id),
      }));

    const cols: MenuOption[] = collectionsStore
      .collectionsInSet(setId)
      .map((col: { id: string | number; title?: string; name?: string }) => ({
        label: () =>
          renderTruncatedLabel(col.title || col.name || `Collection ${col.id}`),
        key: `collection-${col.id}`,
      }));

    return [...childSets, ...cols];
  };

  /** Root-level sets + root-level collections as the children of the Collections group */
  const collectionsTreeChildren = computed<MenuOption[]>(() => {
    const rootSetNodes: MenuOption[] = collectionsStore.rootSets.map(
      (s: { id: string | number; name?: string }) => ({
        label: () => renderTruncatedLabel(s.name || `Set ${s.id}`),
        key: `collection-set-${s.id}`,
        icon: renderIcon(FolderIcon),
        children: buildSetChildren(s.id),
      }),
    );

    const rootColNodes: MenuOption[] = collectionsStore.rootCollections.map(
      (col: { id: string | number; title?: string; name?: string }) => ({
        label: () =>
          renderTruncatedLabel(col.title || col.name || `Collection ${col.id}`),
        key: `collection-${col.id}`,
      }),
    );

    return [...rootSetNodes, ...rootColNodes];
  });

  const series = computed<MenuLeafItem[]>(() =>
    seriesStore.allSeries.map(
      (ser: { id: string | number; title?: string; name?: string }) => ({
        key: `series-${ser.id}`,
        label: ser.title || ser.name || `Series ${ser.id}`,
      }),
    ),
  );

  const buildSeriesSetChildren = (setId: string | number): MenuOption[] => {
    const childSets: MenuOption[] = seriesStore
      .childSetsOf(setId)
      .map((s: { id: string | number; name?: string }) => ({
        label: () => renderTruncatedLabel(s.name || `Set ${s.id}`),
        key: `series-set-${s.id}`,
        icon: renderIcon(FolderIcon),
        children: buildSeriesSetChildren(s.id),
      }));

    const seriesNodes: MenuOption[] = seriesStore
      .seriesInSet(setId)
      .map((ser: { id: string | number; title?: string; name?: string }) => ({
        label: () =>
          renderTruncatedLabel(ser.title || ser.name || `Series ${ser.id}`),
        key: `series-${ser.id}`,
      }));

    return [...childSets, ...seriesNodes];
  };

  const seriesTreeChildren = computed<MenuOption[]>(() => {
    const rootSetNodes: MenuOption[] = seriesStore.rootSets.map(
      (s: { id: string | number; name?: string }) => ({
        label: () => renderTruncatedLabel(s.name || `Set ${s.id}`),
        key: `series-set-${s.id}`,
        icon: renderIcon(FolderIcon),
        children: buildSeriesSetChildren(s.id),
      }),
    );

    const rootSeriesNodes: MenuOption[] = seriesStore.rootSeries.map(
      (ser: { id: string | number; title?: string; name?: string }) => ({
        label: () =>
          renderTruncatedLabel(ser.title || ser.name || `Series ${ser.id}`),
        key: `series-${ser.id}`,
      }),
    );

    return [...rootSetNodes, ...rootSeriesNodes];
  });

  const buildPortfolioSetChildren = (setId: string | number): MenuOption[] => {
    const childSets: MenuOption[] = portfolioBuildsStore
      .childSetsOf(setId)
      .map((s: { id: string | number; name?: string }) => ({
        label: () => renderTruncatedLabel(s.name || `Set ${s.id}`),
        key: `portfolio-set-${s.id}`,
        icon: renderIcon(FolderIcon),
        children: buildPortfolioSetChildren(s.id),
      }));

    const portfolioNodes: MenuOption[] = portfolioBuildsStore
      .buildsInSet(setId)
      .map((build: { id: string | number; config?: { name?: string } }) => ({
        label: () =>
          renderTruncatedLabel(build.config?.name || `Portfolio #${build.id}`),
        key: `portfolio-${build.id}`,
      }));

    return [...childSets, ...portfolioNodes];
  };

  const portfolioTreeChildren = computed<MenuOption[]>(() => {
    const rootSetNodes: MenuOption[] = portfolioBuildsStore.rootSets.map(
      (s: { id: string | number; name?: string }) => ({
        label: () => renderTruncatedLabel(s.name || `Set ${s.id}`),
        key: `portfolio-set-${s.id}`,
        icon: renderIcon(FolderIcon),
        children: buildPortfolioSetChildren(s.id),
      }),
    );

    const rootPortfolioNodes: MenuOption[] =
      portfolioBuildsStore.rootBuilds.map(
        (build: { id: string | number; config?: { name?: string } }) => ({
          label: () =>
            renderTruncatedLabel(
              build.config?.name || `Portfolio #${build.id}`,
            ),
          key: `portfolio-${build.id}`,
        }),
      );

    return [...rootSetNodes, ...rootPortfolioNodes];
  });

  const canvasTreeChildren = computed<MenuOption[]>(() => {
    if (canvasList.value.length === 0) {
      return [
        {
          label: () => renderTruncatedLabel("My Canvas"),
          key: "canvas-placeholder",
        },
      ];
    }
    return canvasList.value.map((canvas) => ({
      label: () => renderTruncatedLabel(canvas.name || `Canvas ${canvas.id}`),
      key: `canvas-${canvas.id}`,
    }));
  });

  const appAccessMode = computed(() => photosStore.appAccessMode);
  const isBlocked = computed(() => appAccessMode.value === "blocked");

  // Helper to create icon render function
  const renderIcon = (icon: any) => {
    return () => h(NIcon, null, { default: () => h(icon) });
  };

  // Render a menu label that shows a tooltip with the full name when truncated
  const renderTruncatedLabel = (text: string) =>
    h(
      "span",
      { class: "collection-menu-item" },
      h(NEllipsis, { style: { maxWidth: "100%" } }, { default: () => text }),
    );

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

  // Import Area (global, outside sections)
  const syncAreaOption = computed<MenuOption>(() => ({
    label: "Import Area",
    key: "import-area",
    icon: renderIcon(toolIcon("import-area")),
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
        children: collectionsTreeChildren.value,
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
            : seriesTreeChildren.value,
      },
      portfolioBuilderOption.value,
    ];

    return {
      label: "Library",
      key: "library-section",
      icon: renderIcon(LibraryIcon),
      disabled: isBlocked.value,
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

  // Atlas (root-level, unified 2D/3D view; 3D unavailable on mobile)
  const atlasOption = computed<MenuOption>(() => ({
    label: isMobileDevice() ? "Atlas 2D" : "Atlas 2D/3D",
    key: "atlas",
    disabled: isBlocked.value,
    icon: renderIcon(MapIcon),
  }));

  // World Map (root-level)
  const worldMapOption = computed<MenuOption>(() => ({
    label: () =>
      h(
        "span",
        {
          class: "root-menu-item-flex",
          style: {
            display: "flex",
            alignItems: "center",
            width: "100%",
          },
        },
        [
          h("span", "World Map"),
          isToolDisabledOnMobile("world-map") ? renderLaptopSuffix()() : null,
        ],
      ),
    key: "world-map",
    disabled: isToolDisabledOnMobile("world-map") || isBlocked.value,
    icon: renderIcon(toolIcon("world-map")),
  }));

  // Canvas (root-level)
  // Opens the canvas directly: the most recent one, or the initial/placeholder
  // canvas when the user has none yet (CanvasView resolves that on its own).
  const openCanvas = () => {
    if (isToolDisabledOnMobile("canvas")) return;

    if (canvasList.value.length === 1) {
      router.push({
        name: "canvas",
        params: { canvasId: String(canvasList.value[0].id) },
      });
    } else {
      router.push({ name: "canvas" });
    }

    if (isMobile.value && closeMobileMenu) {
      closeMobileMenu();
    }
  };

  const canvasOption = computed<MenuOption>(() => ({
    label: () =>
      h(
        "span",
        {
          class: "root-menu-item-flex",
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
                if (!isToolDisabledOnMobile("canvas")) {
                  e.stopPropagation();
                  openCanvas();
                }
              },
              style: {
                cursor: isToolDisabledOnMobile("canvas")
                  ? "default"
                  : "pointer",
                display: "inline-block",
              },
            },
            "Canvas",
          ),
          isToolDisabledOnMobile("canvas") ? renderLaptopSuffix()() : null,
        ],
      ),
    key: "canvas-group",
    // Collapsed sidebar: the label (and its click handler) is hidden, so the
    // submenu's own click handler stands in to open the canvas the same way.
    onClick: () => {
      if (isMenuCollapsed?.()) {
        openCanvas();
      }
    },
    disabled: isToolDisabledOnMobile("canvas") || isBlocked.value,
    icon: renderIcon(toolIcon("canvas")),
    children:
      isToolDisabledOnMobile("canvas") || isBlocked.value
        ? undefined
        : canvasTreeChildren.value,
  }));

  // Framer (root-level)
  const framerOption = computed<MenuOption>(() => ({
    label: "Framer",
    key: "framer",
    disabled: isBlocked.value,
    icon: renderIcon(toolIcon("framer")),
  }));

  // Settings (root-level)
  const settingsOption = computed<MenuOption>(() => ({
    label: "Settings",
    key: "settings",
    icon: renderIcon(toolIcon("settings")),
  }));

  // Help (root-level)
  const helpOption = computed<MenuOption>(() => ({
    label: "Help",
    key: "help",
    icon: renderIcon(toolIcon("help")),
  }));

  // Portfolio Builder
  const portfolioBuilderOption = computed<MenuOption>(() => ({
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
                if (!isToolDisabledOnMobile("portfolios")) {
                  e.stopPropagation();
                  router.push("/portfolios");
                  if (isMobile.value && closeMobileMenu) {
                    closeMobileMenu();
                  }
                }
              },
              style: {
                cursor: isToolDisabledOnMobile("portfolios")
                  ? "default"
                  : "pointer",
                display: "inline-block",
              },
            },
            "Portfolios",
          ),
          isToolDisabledOnMobile("portfolios") ? renderLaptopSuffix()() : null,
        ],
      ),
    key: "portfolios-group",
    disabled: isToolDisabledOnMobile("portfolios") || isBlocked.value,
    icon: renderIcon(toolIcon("portfolios")),
    children:
      isToolDisabledOnMobile("portfolios") || isBlocked.value
        ? undefined
        : portfolioTreeChildren.value,
  }));

  // Tag Cloud (root-level)
  const tagcloudOption = computed<MenuOption>(() => ({
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
          h("span", "Tag Cloud"),
          isToolDisabledOnMobile("tagcloud") ? renderLaptopSuffix()() : null,
        ],
      ),
    key: "tagcloud",
    disabled: isToolDisabledOnMobile("tagcloud") || isBlocked.value,
    icon: renderIcon(toolIcon("tagcloud")),
  }));

  // Chat option — mobile only. On desktop the chat has no route of its own:
  // it lives in the dashboard's center panel.
  const chatOption = computed<MenuOption | null>(() =>
    isMobileDevice()
      ? {
          label: "ChatLab",
          key: "chat-lab",
          icon: renderIcon(toolIcon("chat")),
          disabled: false,
        }
      : null,
  );

  // Complete menu structure
  const menuOptions = computed<MenuOption[]>(() => {
    const options: Array<MenuOption | null> = [
      syncAreaOption.value,
      {
        type: "divider",
        key: "sync-divider",
      } as MenuOption,
      workspaceOption.value,

      librarySection.value,

      canvasOption.value,
      {
        type: "divider",
        key: "library-divider",
      } as MenuOption,

      // Chat and its trailing divider only exist on mobile.
      chatOption.value,
      chatOption.value
        ? ({
            type: "divider",
            key: "chat-divider",
          } as MenuOption)
        : null,

      searchOption.value,
      tagcloudOption.value,
      atlasOption.value,
      worldMapOption.value,

      reportOption.value,

      {
        type: "divider",
        key: "tools-divider",
      } as MenuOption,
      framerOption.value,
      {
        type: "divider",
        key: "settings-divider",
      } as MenuOption,
      settingsOption.value,
      // helpOption.value,
    ];

    return options.filter((option): option is MenuOption => option !== null);
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
    canvasList,
  };
}
