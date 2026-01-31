import { computed, h, ref } from "vue";
import { NIcon } from "naive-ui";
import type { MenuOption } from "naive-ui";
import { usePhotosStore } from "@/stores/photos";
import { useCollectionsStore } from "@/stores/collections";
import { useSeriesStore } from "@/stores/series";
import { isMobileDevice } from "@/utils/utils";
import { useRouter } from "vue-router";

// Import icons for tools (existing)
import {
  LayersOutline,
  CloudUploadOutline,
  GridOutline as CollectionsIcon,
  ListOutline as SeriesIcon,
  SearchOutline as SearchIcon,
  CubeOutline as CubeIcon,
  AnalyticsOutline as ReportIcon,
  SquareOutline as FramerIcon,
  SettingsOutline as SettingsIcon,
  HelpCircleOutline as HelpIcon,
  MapOutline as MapIcon,
  Image as ImageIcon,
} from "@vicons/ionicons5";

// Import icons for sections (generic)
import {
  LibraryOutline as LibraryIcon,
  CompassOutline as ExploreIcon,
  CreateOutline as CreateIcon,
  ConstructOutline as SystemIcon,
} from "@vicons/ionicons5";

import { Workspace as CanvasIcon } from "@vicons/carbon";

export function useMainMenu() {
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
  const isMobileLimitedMode = computed(() => isMobileDevice());
  const isBlocked = computed(() => appAccessMode.value === "blocked");

  // Helper to create icon render function
  const renderIcon = (icon: any) => {
    return () => h(NIcon, null, { default: () => h(icon) });
  };

  // Sync Area (global, outside sections)
  const syncAreaOption = computed<MenuOption>(() => ({
    label: "Sync Area",
    key: "sync-area",
    icon: renderIcon(CloudUploadOutline),
  }));

  // Library Section
  const librarySection = computed<MenuOption>(() => {
    const children: MenuOption[] = [
      {
        label: () =>
          h("span", { class: "second-level-menu-item" }, "Workspace"),
        key: "workspace",
        icon: renderIcon(LayersOutline),
      },
      {
        label: () =>
          h(
            "span",
            { class: "second-level-menu-item" },
            h(
              "div",
              {
                onClick: (e: MouseEvent) => {
                  e.stopPropagation();
                  router.push("/collections");
                },
                style: {
                  cursor: "pointer",
                  width: "100%",
                },
              },
              "Collections",
            ),
          ),
        key: "collections-group",
        icon: renderIcon(CollectionsIcon),
        disabled: isBlocked.value,
        children: collections.value.map((col) => ({
          label: () => h("span", { class: "collection-menu-item" }, col.label),
          key: col.key,
        })),
      },
      //   {
      //     label: () =>
      //       h(
      //         "div",
      //         {
      //           onClick: (e: MouseEvent) => {
      //             e.stopPropagation();
      //             router.push("/series");
      //           },
      //           style: {
      //             cursor: "pointer",
      //             width: "100%",
      //           },
      //         },
      //         "All Series",
      //       ),
      //     key: "series-group",
      //     icon: renderIcon(SeriesIcon),
      //     disabled: isBlocked.value,
      //     children: series.value.map((ser) => ({
      //       label: ser.label,
      //       key: ser.key,
      //     })),
      //   },
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
        icon: renderIcon(SearchIcon),
      },

      {
        label: () => h("span", { class: "second-level-menu-item" }, "Report"),
        key: "report",
        disabled: isBlocked.value,
        icon: renderIcon(ReportIcon),
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
            icon: renderIcon(ImageIcon),
          },
          ...(!isMobileLimitedMode.value
            ? [
                {
                  label: () =>
                    h("span", { class: "collection-menu-item" }, "3D Atlas"),
                  key: "atlas",
                  icon: renderIcon(CubeIcon),
                },
              ]
            : []),
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
    const children: MenuOption[] = [];

    // Only show full create tools on desktop
    if (!isMobileLimitedMode.value) {
      children.push(
        {
          label: () =>
            h(
              "span",
              { class: "second-level-menu-item" },
              h(
                "div",
                {
                  onClick: (e: MouseEvent) => {
                    e.stopPropagation();
                    router.push("/series");
                  },
                  style: {
                    cursor: "pointer",
                    width: "100%",
                  },
                },
                "Series",
              ),
            ),
          key: "series-group",
          icon: renderIcon(SeriesIcon),
          disabled: isBlocked.value,
          children: series.value.map((ser) => ({
            label: () =>
              h("span", { class: "collection-menu-item" }, ser.label),
            key: ser.key,
          })),
        },
        {
          label: () => h("span", { class: "second-level-menu-item" }, "Canvas"),
          key: "canvas",
          disabled: isBlocked.value,
          icon: renderIcon(CanvasIcon),
        },
      );
    }

    // Framer is available on both mobile and desktop
    children.push({
      label: () => h("span", { class: "second-level-menu-item" }, "Framer"),
      key: "framer",
      disabled: isBlocked.value,
      icon: renderIcon(FramerIcon),
    });

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
        icon: renderIcon(SettingsIcon),
      },
      {
        label: () => h("span", { class: "second-level-menu-item" }, "Help"),
        key: "help",
        icon: renderIcon(HelpIcon),
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
        key: "sync-divider",
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
