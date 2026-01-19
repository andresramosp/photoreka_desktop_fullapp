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

      <!-- Unified Menu -->
      <n-menu
        :collapsed="false"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="activeKey"
        :expanded-keys="expandedKeys"
        :accordion="exclusiveMenuMode"
        @update:value="handleMenuSelect"
        @update:expanded-keys="handleExpandedKeysChange"
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
    :width="260"
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

      <!-- Unified Menu -->
      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="activeKey"
        :expanded-keys="expandedKeys"
        :accordion="exclusiveMenuMode"
        @update:value="handleMenuSelect"
        @update:expanded-keys="handleExpandedKeysChange"
        class="sidebar-menu"
      />

      <!-- Usage Indicators -->
      <div v-if="!collapsed" class="usage-indicators-section">
        <UsageIndicators />
      </div>
    </div>
  </n-layout-sider>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useMainMenu } from "@/composables/useMainMenu";
import {
  ChevronForwardOutline as ChevronRightIcon,
  ChevronBackOutline as ChevronLeftIcon,
} from "@vicons/ionicons5";
import AppLogo from "./AppLogo.vue";
import UsageIndicators from "./UsageIndicators.vue";

const router = useRouter();
const route = useRoute();
const collapsed = ref(true);
const menuMode = ref<"hover" | "toggle">("toggle");

const props = defineProps<{
  mobileMenuOpen?: boolean;
}>();

const emit = defineEmits(["close-mobile-menu"]);

// Use the main menu composable
const {
  menuOptions,
  defaultExpandedKeys,
  isMobile,
  updateIsMobile,
  exclusiveMenuMode,
} = useMainMenu();

const activeKey = computed(() => {
  const routeName = route.name as string;

  // Handle collection detail routes
  if (routeName === "collection-detail" && route.params.id) {
    return `collection-${route.params.id}`;
  }

  // Handle series detail routes
  if (routeName === "series-detail" && route.params.id) {
    return `series-${route.params.id}`;
  }

  // Handle collections list view - mark the group as active
  if (routeName === "collections") {
    return "collections-group";
  }

  // Handle series list view - mark the group as active
  if (routeName === "series") {
    return "series-group";
  }

  return routeName;
});
const expandedKeys = ref<string[]>([...defaultExpandedKeys.value]);

const handleMenuSelect = (key: string) => {
  // Skip navigation for section headers (they don't have routes)
  if (key.endsWith("-section") || key.endsWith("-group")) {
    return;
  }

  if (key === "sync-area") {
    router.push({ name: "sync-area", hash: "#upload" });
  } else if (key.startsWith("collection-") || key.startsWith("series-")) {
    // Navegación usando /id en vez de query string
    if (key.startsWith("collection-")) {
      // Extraer el id después de "collection-"
      const id = key.replace("collection-", "");
      router.push(`/collections/${id}`);
    } else {
      // Extraer el id después de "series-"
      const id = key.replace("series-", "");
      router.push(`/series/${id}`);
    }
  } else {
    router.push({ name: key });
  }

  // On mobile, close menu after selection
  if (isMobile.value) {
    emit("close-mobile-menu");
  }
};

const handleExpandedKeysChange = (keys: string[]) => {
  expandedKeys.value = keys;
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
  updateIsMobile();
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
  margin-top: 4px;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.usage-indicators-section {
  /* margin-top: auto; */
  margin-bottom: 39px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Remove the old divider styles - no longer needed */

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
  width: 260px;
  height: 100vh;

  z-index: 1000;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

@keyframes slideIn {
  from {
    left: -260px;
  }
  to {
    left: 0;
  }
}
</style>
