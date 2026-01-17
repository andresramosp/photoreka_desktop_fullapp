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
          <AppLogo layout="horizontal" :height="43" />
        </div>
      </div>

      <!-- First Menu Section: Workspace, Sync Area -->
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

      <!-- Third Divider (only show if fourth section has items) -->
      <div v-if="fourthSectionOptions.length > 0" class="menu-divider"></div>

      <!-- Fourth Menu Section: Settings, Help (hidden on mobile) -->
      <n-menu
        v-if="fourthSectionOptions.length > 0"
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
            <AppLogo layout="icon" :height="43" />
          </div>
          <div v-if="!collapsed" class="logo-text">
            <AppLogo layout="horizontal" :height="43" />
          </div>
        </div>
      </div>

      <!-- First Menu Section: Workspace, Sync Area -->
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
import { isMobileDevice } from "@/utils/utils.js";

import { Workspace as CanvasIcon } from "@vicons/carbon";

// Import @vicons icons from ionicons5 for reliability
import {
  GridOutline as DashboardIcon,
  CameraOutline as PhotoHubIcon,
  FolderOpenOutline as WorkspaceIcon,
  GridOutline as CollectionsIcon,
  ListOutline as SeriesIcon,
  ApertureOutline as StylerIcon,
  SearchOutline as SearchIcon,
  FlaskOutline as CurationIcon,
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
  LayersOutline,
  RepeatOutline,
  SwapHorizontalOutline,
  CloudUploadOutline,
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

// Check if we're in mobile limited mode
const isMobileLimitedMode = computed(() => isMobileDevice());

// First section: Workspace, Sync Area (Photo Hub)
const firstSectionOptions = computed(() => [
  {
    label: "Workspace",
    key: "workspace",
    icon: () => h(NIcon, null, { default: () => h(LayersOutline) }),
  },
  {
    label: "Sync Area",
    key: "sync-area",
    icon: () => h(NIcon, null, { default: () => h(CloudUploadOutline) }),
  },
]);

// Second section: Collections, Series
const collectionsSeriesOptions = computed(() => [
  {
    label: "Collections",
    key: "collections",
    disabled: appAccessMode.value === "blocked",
    icon: () => h(NIcon, null, { default: () => h(CollectionsIcon) }),
  },
  {
    label: "Series",
    key: "series",
    disabled: appAccessMode.value === "blocked",
    icon: () => h(NIcon, null, { default: () => h(SeriesIcon) }),
  },
]);

// Third section: Explorer, Canvas, Curation, Grids, Styler
// On mobile: only show Explorer (search)
const thirdSectionToolsOptions = computed(() => {
  const isBlocked = appAccessMode.value === "blocked";

  // On mobile, only show Explorer
  if (isMobileLimitedMode.value) {
    return [
      {
        label: "Search",
        key: "search",
        disabled: isBlocked,
        props: isBlocked ? { title: "Add photos to your catalog" } : {},
        icon: () => h(NIcon, null, { default: () => h(SearchIcon) }),
      },
    ];
  }

  return [
    {
      label: "Search",
      key: "search",
      disabled: isBlocked,
      props: isBlocked ? { title: "Add photos to your catalog" } : {},
      icon: () => h(NIcon, null, { default: () => h(SearchIcon) }),
    },
    {
      label: "3D Atlas",
      key: "atlas",
      disabled: isBlocked,
      props: isBlocked ? { title: "Add photos to your catalog" } : {},
      icon: () => h(NIcon, null, { default: () => h(CubeIcon) }),
    },
    {
      label: "Canvas",
      key: "canvas",
      disabled: isBlocked,
      props: isBlocked ? { title: "Add photos to your catalog" } : {},
      icon: () => h(NIcon, null, { default: () => h(CanvasIcon) }),
    },
    // {
    //   label: "Project Builder",
    //   key: "project-builder",
    //   disabled: isBlocked,
    //   props: isBlocked ? { title: "Add photos to your catalog" } : {},
    //   icon: () => h(NIcon, null, { default: () => h(CurationIcon) }),
    // },
    {
      label: "Framer",
      key: "framer",
      disabled: isBlocked,
      props: isBlocked ? { title: "Add photos to your catalog" } : {},
      icon: () => h(NIcon, null, { default: () => h(FramerIcon) }),
    },
  ];
});

// Fourth section: Settings, Help (always enabled)
// On mobile, hide Settings and Help from sidebar
const fourthSectionOptions = computed<MenuOption[]>(() => {
  if (isMobileLimitedMode.value) {
    return [];
  }
  return [
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
});

const handleMenuSelect = (key: string) => {
  if (key === "sync-area") {
    router.push({ name: "sync-area", hash: "#upload" });
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
  border-bottom: 1px solid var(--border-color);
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
  color: var(--text-secondary);
  line-height: 1.2;
  white-space: nowrap;
}

.app-subtitle {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-primary);
  line-height: 1.2;
  white-space: nowrap;
}

.sidebar-menu {
  margin-top: 8px;
}

/* Aplicar opacidad al fondo del item activo (menú expandido y colapsado) */
:deep(.n-menu-item.n-menu-item--selected) {
  position: relative;
}

:deep(.n-menu-item.n-menu-item--selected::before) {
  content: "";
  position: absolute;
  inset: 0;
  background-color: currentColor;
  opacity: 0.15;
  border-radius: inherit;
  pointer-events: none;
}

:deep(.n-menu-item.n-menu-item--selected:hover::before) {
  opacity: 0.25;
}

.menu-divider {
  /* margin: 16px 20px; */
  height: 1px;
  background-color: var(--border-color);
  transition: margin 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.menu-divider.collapsed {
  /* margin: 16px 12px; */
}

.user-profile-section {
  margin-top: auto;
  padding: 16px;
  border-top: 1px solid;
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
  color: var(--text-secondary);
  line-height: 1.2;
  margin-bottom: 2px;
  white-space: nowrap;
}

.user-email {
  font-size: 12px;
  color: var(--text-primary);
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
  background-color: var(--bg-container);
  position: fixed;
  top: 0;
  left: 0;
  width: 240px;
  height: 100vh;

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
</style>
