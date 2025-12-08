<template>
  <!-- Mobile overlay version -->
  <div v-if="isMobile" class="mobile-sidebar-container">
    <!-- Mobile overlay backdrop -->
    <div
      v-if="props.mobileMenuOpen"
      class="mobile-overlay"
      @click="emit('close-mobile-menu')"
    ></div>

    <!-- Mobile sidebar -->
    <div v-if="props.mobileMenuOpen" class="mobile-sidebar">
      <div class="logo-container">
        <div class="logo clickable-logo" @click="goToDashboard">
          <div class="logo-icon">
            <img
              :src="logoImagoName"
              alt="Photoreka"
              class="logo-brand-image"
            />
          </div>
          <div class="logo-text">
            <img :src="logoName" alt="Photoreka" class="logo-brand-image" />
            <div class="app-subtitle">Photo Lab</div>
          </div>
        </div>
      </div>

      <!-- First Menu Section: Photo Hub -->
      <n-menu
        :collapsed="false"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="firstSectionOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="sidebar-menu"
      />

      <!-- First Divider -->
      <div class="menu-divider"></div>

      <!-- Second Menu Section: Collections, Series -->
      <n-menu
        :collapsed="false"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="collectionsSeriesOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="sidebar-menu"
      />

      <!-- Second Divider -->
      <div class="menu-divider"></div>

      <!-- Third Menu Section: Search, Canvas, Curation -->
      <n-menu
        :collapsed="false"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="thirdSectionToolsOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="sidebar-menu"
      />

      <!-- Third Divider -->
      <div class="menu-divider"></div>

      <!-- Fourth Menu Section: Settings, Help -->
      <n-menu
        :collapsed="false"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="fourthSectionOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="sidebar-menu"
      />
    </div>
  </div>

  <!-- Desktop version -->
  <n-layout-sider
    v-else
    bordered
    collapse-mode="width"
    :collapsed-width="64"
    :width="240"
    :collapsed="collapsed"
    class="sidebar"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="sidebar-content">
      <!-- Toggle Button (only visible in toggle mode) -->
      <div
        v-if="menuMode === 'toggle'"
        class="toggle-button-fixed"
        :class="{ collapsed }"
      >
        <n-button
          quaternary
          circle
          size="small"
          class="toggle-btn"
          @click="toggleSidebar"
        >
          <template #icon>
            <n-icon>
              <ChevronRightIcon v-if="collapsed" />
              <ChevronLeftIcon v-else />
            </n-icon>
          </template>
        </n-button>
      </div>
      <div class="logo-container">
        <div class="logo clickable-logo" @click="goToDashboard">
          <div v-if="collapsed" class="logo-icon">
            <img
              :src="logoImagoName"
              alt="Photoreka"
              class="logo-brand-image"
            />
          </div>
          <div v-if="!collapsed" class="logo-text">
            <AppLogo :height="43" :showText="true" :inline="true" />
          </div>
        </div>
      </div>

      <!-- First Menu Section: Photo Hub -->
      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="firstSectionOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="sidebar-menu"
      />

      <!-- First Divider -->
      <div class="menu-divider" :class="{ collapsed }"></div>

      <!-- Second Menu Section: Collections, Series -->
      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="collectionsSeriesOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="sidebar-menu"
      />

      <!-- Second Divider -->
      <div class="menu-divider" :class="{ collapsed }"></div>

      <!-- Third Menu Section: Search, Canvas, Curation -->
      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="thirdSectionToolsOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="sidebar-menu"
      />

      <!-- Third Divider -->
      <div class="menu-divider" :class="{ collapsed }"></div>

      <!-- Fourth Menu Section: Settings, Help -->
      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="fourthSectionOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
        class="sidebar-menu"
      />
    </div>
  </n-layout-sider>
</template>

<script setup lang="ts">
import { ref, h, computed, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { NIcon } from "naive-ui";
import type { MenuOption } from "naive-ui";
import { usePhotosStore } from "@/stores/photos.js";

import { Workspace as CanvasIcon } from "@vicons/carbon";
import logoName from "@/assets/logos/logo_name_sub_white_center.png";
import logoImagoName from "@/assets/logos/logo_imago_white.png";

// Import @vicons icons from ionicons5 for reliability
import {
  GridOutline as DashboardIcon,
  CameraOutline as PhotoHubIcon,
  AlbumsOutline as CollectionsIcon,
  ListOutline as SeriesIcon,
  ApertureOutline as StylerIcon,
  SearchOutline as SearchIcon,
  ImagesOutline as CurationIcon,
  AnalyticsOutline as AnalyticsIcon,
  CubeOutline as CubeIcon,
  // ColorPaletteOutline as StylerIcon,
  AppsOutline as GridIcon,
  SettingsOutline as SettingsIcon,
  HelpCircleOutline as HelpIcon,
  PersonOutline,
  LogOutOutline,
  ChevronForwardOutline as ChevronRightIcon,
  ChevronBackOutline as ChevronLeftIcon,
  ConstructOutline as ConstructionIcon,
  ConstructOutline,
  SquareOutline as FramerIcon,
} from "@vicons/ionicons5";
import { ConstructionOutlined, ConstructionSharp } from "@vicons/material";
import AppLogo from "./AppLogo.vue";

const router = useRouter();
const route = useRoute();
const photosStore = usePhotosStore();
const collapsed = ref(true); // Default collapsed (showing only icons)
const isMobile = ref(window.innerWidth < 768); // Initialize immediately
const menuMode = ref<"hover" | "toggle">("toggle"); // 'hover' for original behavior, 'toggle' for new behavior

const props = defineProps<{
  mobileMenuOpen?: boolean;
}>();

const emit = defineEmits(["close-mobile-menu"]);

const activeKey = computed(() => route.name as string);
const appAccessMode = computed(() => photosStore.appAccessMode);

// First section: Photo Hub only
const firstSectionOptions = computed(() => [
  {
    label: createMenuLabel("Photo Hub"),
    key: "catalog",
    // icon: createIconWithIndicator(PhotoHubIcon, "#2563eb"),
    icon: () =>
      h(
        "div",
        {
          style:
            "position: relative; display: flex; align-items: center; justify-content: center;",
        },
        [
          // Use theme primary color variable so the icon follows the app theme
          h(
            NIcon,
            { color: "var(--primary-color)" },
            { default: () => h(PhotoHubIcon) }
          ),
          // Visual indicator when blocked (visible in both collapsed and expanded states)
          appAccessMode.value === "blocked"
            ? h("div", {
                class: "photo-hub-indicator",
                style:
                  "position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 6px #22c55e; animation: pulse 2s infinite;",
              })
            : null,
        ]
      ),
  },
]);

// Second section: Collections, Series
const collectionsSeriesOptions = computed(() => [
  {
    label: createMenuLabel("Collections", false),
    key: "collections",
    disabled: appAccessMode.value === "blocked",
    icon: createIconWithIndicator(CollectionsIcon, "#10b981"), // Green color for collections
  },
  {
    label: createMenuLabel("Series", false),
    key: "series",
    disabled: appAccessMode.value === "blocked",
    icon: createIconWithIndicator(SeriesIcon, "#8b5cf6"), // Purple color for series
  },
]);

// Function to create icon with premium or coming soon indicator
const createIconWithIndicator = (
  IconComponent: any,
  color: string,
  isPremium = false,
  isComingSoon = false
) => {
  return () =>
    h(
      "div",
      {
        style:
          "position: relative; display: flex; align-items: center; justify-content: center;",
      },
      [
        h(
          NIcon,
          { color },
          {
            default: () => h(IconComponent),
          }
        ),
        // Premium indicator (diamond shape)
        isPremium
          ? h("div", {
              class: "premium-indicator-diamond",
              style: `
                position: absolute;
                top: -4px;
                right: -4px;
                width: 8px;
                height: 8px;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                transform: rotate(45deg);
                box-shadow: 0 0 4px rgba(245, 158, 11, 0.4);
                border: 1px solid #16161a;
              `,
            })
          : null,
        // Coming soon indicator (construction icon overlay)
        isComingSoon
          ? h(
              "div",
              {
                style: `
                position: absolute;
                top: -2px;
                right: -2px;
                width: 12px;
                height: 12px;
                background: #6b7280;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid #16161a;
                box-shadow: 0 0 4px rgba(107, 114, 128, 0.4);
              `,
              },
              [
                h(
                  NIcon,
                  {
                    size: 9,
                    color: "#ffffff",
                  },
                  {
                    default: () => h(ConstructionSharp),
                  }
                ),
              ]
            )
          : null,
      ]
    );
};

// Function to create menu label with coming soon styling
const createMenuLabel = (label: string, isComingSoon = false) => {
  return () =>
    h(
      "span",
      {
        style: isComingSoon ? "font-style: italic; opacity: 0.7;" : "",
      },
      label
    );
};

// Third section: Explorer, Canvas, Curation, Grids, Styler
const thirdSectionToolsOptions = computed(() => {
  const isBlocked = appAccessMode.value === "blocked";
  const isFull = appAccessMode.value === "full";

  return [
    {
      label: createMenuLabel("Explorer"),
      key: "search",
      disabled: isBlocked,
      comingSoon: false,
      props: isBlocked
        ? {
            title: "Add photos to your catalog",
          }
        : {},
      icon: createIconWithIndicator(SearchIcon, "#60b6d4"), // Info color for search functionality
    },
    {
      label: createMenuLabel("3D Atlas"),
      key: "atlas",
      disabled: isBlocked,
      comingSoon: false,
      props: isBlocked
        ? {
            title: "Add photos to your catalog",
          }
        : {},
      icon: createIconWithIndicator(CubeIcon, "#8b5cf6", false, false), // Purple color for 3D view
    },
    {
      label: createMenuLabel("Canvas"),
      key: "canvas",
      disabled: isBlocked,
      comingSoon: false,
      props: isBlocked
        ? {
            title: "Add photos to your catalog",
          }
        : {},
      icon: createIconWithIndicator(CanvasIcon, "#8b5cf6", false, false), // Secondary color for creative tools
    },

    {
      label: createMenuLabel("Grid Maker"),
      key: "grid-maker",
      disabled: isBlocked,
      comingSoon: false,
      props: {
        title: "Coming soon",
      },
      icon: createIconWithIndicator(GridIcon, "#15803d", false, false), // Green color for grids
    },
    {
      label: createMenuLabel("Project Builder"),
      key: "project-builder",
      disabled: isBlocked,
      comingSoon: false,
      props: isBlocked
        ? {
            title: "Add photos to your catalog",
          }
        : {},
      icon: createIconWithIndicator(CurationIcon, "#f59e0b", true), // Warning color for curation + premium
    },

    // {
    //   label: createMenuLabel("Reports"),
    //   key: "portfolio-report",
    //   disabled: isBlocked,
    //   comingSoon: false,
    //   props: isBlocked
    //     ? {
    //         title: "Add photos to your catalog",
    //       }
    //     : {},
    //   icon: createIconWithIndicator(AnalyticsIcon, "#06b6d4", false, false), // Cyan color for analytics
    // },
    {
      label: createMenuLabel("Framer"),
      key: "framer",
      disabled: isBlocked,
      comingSoon: false,
      props: isBlocked
        ? {
            title: "Add photos to your catalog",
          }
        : {},
      icon: createIconWithIndicator(FramerIcon, "#dc2626", false, false), // Red color for framer
    },
  ];
});

// Fourth section: Settings, Help (always enabled)
const fourthSectionOptions: MenuOption[] = [
  {
    label: "Settings",
    key: "settings",
    icon: () => h(NIcon, null, { default: () => h(SettingsIcon) }),
  },
  {
    label: "Help",
    key: "help",
    icon: () => h(NIcon, null, { default: () => h(HelpIcon) }),
  },
];

const handleMenuSelect = (key: string) => {
  if (key === "catalog") {
    router.push({ name: "photo-hub", hash: "#catalog" });
  } else {
    router.push({ name: key });
  }
  // On mobile, close menu after selection
  if (isMobile.value) {
    emit("close-mobile-menu");
  }
};

const goToDashboard = () => {
  router.push({ name: "dashboard" });
  // On mobile, close menu after selection
  if (isMobile.value) {
    emit("close-mobile-menu");
  }
};

const handleMouseEnter = () => {
  if (!isMobile.value && menuMode.value === "hover") {
    collapsed.value = false;
  }
};

const handleMouseLeave = () => {
  if (!isMobile.value && menuMode.value === "hover") {
    collapsed.value = true;
  }
};

const toggleSidebar = () => {
  if (!isMobile.value && menuMode.value === "toggle") {
    collapsed.value = !collapsed.value;
  }
};

const setMenuMode = (mode: "hover" | "toggle") => {
  menuMode.value = mode;
  // If switching to hover mode, expand sidebar by default
  if (mode === "hover" && !isMobile.value) {
    collapsed.value = true;
  }
};

// Expose functions for external use
defineExpose({
  setMenuMode,
  toggleSidebar,
  menuMode: computed(() => menuMode.value),
  collapsed: computed(() => collapsed.value),
});

const checkIsMobile = () => {
  isMobile.value = window.innerWidth < 768;
  // On mobile, keep collapsed by default and close mobile menu
  if (isMobile.value) {
    collapsed.value = true;
    emit("close-mobile-menu");
  }
};

onMounted(() => {
  window.addEventListener("resize", checkIsMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkIsMobile);
});
</script>

<style scoped>
.sidebar {
  background-color: #16161a !important;
  border-right: 1px solid #2c2c32 !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  z-index: 100 !important;
  overflow: visible !important;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.logo-container {
  padding: 0 16px;
  border-bottom: 1px solid #2c2c32;
  transition: padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  transition: gap 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.clickable-logo {
  cursor: pointer;
  border-radius: 8px;
  padding: 4px;
  transition: background-color 0.2s ease;
}

.logo-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  /* background-color: rgba(37, 99, 235, 0.1); */
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

.logo-image {
  height: 170px;
  width: auto;
  object-fit: contain;
}

.logo-brand-image {
  height: 43px;
  width: auto;
  object-fit: contain;
}

.logo-icon:hover {
  background-color: rgba(37, 99, 235, 0.15);
}

.logo-text {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  overflow: hidden;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.app-name {
  font-size: 18px;
  font-weight: 600;
  color: #ffffffd1;
  line-height: 1.2;
  white-space: nowrap;
}

.app-subtitle {
  font-size: 12px;
  font-weight: 400;
  color: #ffffff73;
  line-height: 1.2;
  white-space: nowrap;
}

.sidebar-menu {
  margin-top: 8px;
}

.menu-divider {
  /* margin: 16px 20px; */
  height: 1px;
  background-color: #2c2c32;
  transition: margin 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.menu-divider.collapsed {
  /* margin: 16px 12px; */
}

.user-profile-section {
  margin-top: auto;
  padding: 16px;
  border-top: 1px solid #2c2c32;
  transition: padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.user-profile-section.collapsed {
  padding: 16px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.user-profile-section.collapsed .user-profile {
  justify-content: center;
  width: auto;
  gap: 0;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.user-avatar {
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
  opacity: 1;
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.user-info.collapsed {
  opacity: 0;
  width: 0;
  min-width: 0;
  flex: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: #ffffffd1;
  line-height: 1.2;
  margin-bottom: 2px;
  white-space: nowrap;
}

.user-email {
  font-size: 12px;
  color: #ffffff73;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logout-btn {
  flex-shrink: 0;
  color: #9ca3af;
  opacity: 1;
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.logout-btn.collapsed {
  opacity: 0;
  width: 0;
  min-width: 0;
  flex: 0;
}

.toggle-button-fixed {
  position: absolute;
  right: 16px;
  bottom: 10px;
  z-index: 101;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-button-fixed.collapsed {
  right: 16px;
}

.toggle-btn {
  color: #9ca3af;
  transition: all 0.2s ease;
  background-color: rgba(156, 163, 175, 0.1);
}

.toggle-btn:hover {
  color: #d1d5db;
  background-color: rgba(156, 163, 175, 0.2);
}

/* Mobile sidebar container */
.mobile-sidebar-container {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.mobile-sidebar-container > * {
  pointer-events: auto;
}

/* Mobile overlay */
.mobile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 999;
}

/* Mobile sidebar */
.mobile-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 240px;
  height: 100vh;
  background-color: #16161a;
  border-right: 1px solid #2c2c32;
  z-index: 1000;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

@keyframes slideIn {
  from {
    left: -240px;
  }
  to {
    left: 0;
  }
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
  }

  70% {
    transform: scale(1);
    box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
  }

  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}

.premium-indicator-diamond {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 8px;
  height: 8px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  transform: rotate(45deg);
  box-shadow: 0 0 4px rgba(245, 158, 11, 0.4);
  border: 1px solid #16161a;
}
</style>
