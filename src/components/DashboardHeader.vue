<template>
  <n-layout-header bordered class="header">
    <div class="header-content" :class="{ 'search-expanded': searchExpanded }">
      <div class="header-left" :class="{ 'search-expanded': searchExpanded }">
        <n-button
          v-if="isMobile"
          quaternary
          circle
          class="hamburger-btn"
          :class="{ hidden: searchExpanded }"
          @click="$emit('toggle-mobile-menu')"
        >
          <template #icon>
            <n-icon>
              <MenuOutline />
            </n-icon>
          </template>
        </n-button>

        <div
          v-if="!isMobile"
          class="search-container"
          :class="{ expanded: searchExpanded }"
        >
          <GlobalSearchAutocomplete
            @search-focus="handleSearchFocus"
            @search-blur="handleSearchBlur"
          />
        </div>
        <!-- Esto habria que centrar el logo -->
        <div
          style="
            display: flex;
            justify-content: center;
            align-items: center;
            flex: 1;
          "
          v-else
        >
          <AppLogo layout="horizontal" />
        </div>
      </div>

      <div class="header-right" :class="{ hidden: searchExpanded }">
        <n-space>
          <!-- <n-button circle quaternary class="header-icon-btn">
            <template #icon>
              <n-icon size="20">
                <NotificationsIcon />
              </n-icon>
            </template>
          </n-button> -->

          <!-- <n-button circle quaternary class="header-icon-btn">
            <template #icon>
              <n-icon size="20">
                <SettingsIcon />
              </n-icon>
            </template>
          </n-button> -->

          <n-button
            v-if="canToggleTheme(false)"
            circle
            quaternary
            class="header-icon-btn"
            @click="toggleTheme"
            :aria-label="`Switch to ${
              themeMode === 'dark' ? 'light' : 'dark'
            } mode`"
          >
            <template #icon>
              <n-icon size="20">
                <component
                  :is="themeMode === 'dark' ? SunnyOutline : MoonOutline"
                />
              </n-icon>
            </template>
          </n-button>

          <n-dropdown
            :options="userMenuOptions"
            @select="handleUserMenuSelect"
            trigger="click"
            placement="bottom-end"
          >
            <n-avatar
              size="small"
              class="user-avatar"
              :color="'var(--primary-color)'"
              :src="userStore.user?.avatar"
            >
              {{ userStore.user?.name?.charAt(0)?.toUpperCase() || "U" }}
            </n-avatar>
          </n-dropdown>
        </n-space>
      </div>
    </div>
  </n-layout-header>
</template>

<script setup lang="ts">
import { computed, h, ref, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NIcon, useMessage } from "naive-ui";
import { useUserStore } from "../stores/userStore";

// Import @vicons icons from ionicons5 for reliability
import {
  NotificationsOutline as NotificationsIcon,
  SettingsOutline as SettingsIcon,
  MenuOutline,
  PersonOutline as PersonIcon,
  LogOutOutline as LogOutIcon,
  SunnyOutline,
  MoonOutline,
} from "@vicons/ionicons5";
import { useTheme } from "../composables/useTheme.js";
import GlobalSearchAutocomplete from "./GlobalSearchAutocomplete.vue";
import AppLogo from "./AppLogo.vue";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const message = useMessage();
const isMobile = ref(false);
const searchExpanded = ref(false);

// Theme management
const { themeMode, toggleTheme, canToggleTheme } = useTheme();

defineEmits(["toggle-mobile-menu"]);

const userMenuOptions = [
  {
    label: () =>
      h("div", { class: "user-menu-header" }, [
        h(
          "div",
          { class: "user-email-main" },
          userStore.user?.email || "user@photoreka.app",
        ),
      ]),
    key: "user-info",
    disabled: true,
  },
  {
    type: "divider",
  },

  {
    label: "Settings",
    key: "settings",
    icon: () => h(NIcon, null, { default: () => h(SettingsIcon) }),
  },
  {
    type: "divider",
  },
  {
    label: "Log Out",
    key: "logout",
    icon: () => h(NIcon, null, { default: () => h(LogOutIcon) }),
  },
];

const handleUserMenuSelect = (key: string) => {
  if (key === "logout") {
    userStore.logout();
    message.success("You have logged out successfully");
    router.push("/auth");
  } else if (key === "profile") {
    // Navigate to profile or open profile modal
    message.info("Profile feature in development");
  } else if (key === "settings") {
    router.push("/settings");
  }
};

const checkIsMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

const handleSearchFocus = () => {
  // if (isMobile.value) {
  //   searchExpanded.value = true;
  // }
};

const handleSearchBlur = () => {
  searchExpanded.value = false;
};

onMounted(() => {
  checkIsMobile();
  window.addEventListener("resize", checkIsMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkIsMobile);
});
</script>

<style scoped>
.header {
  background-color: var(--bg-body) !important;
  border-bottom: 1px solid var(--border-color) !important;
  padding: 0 var(--spacing-2xl);
  height: 64px;
  display: flex;
  align-items: center;
  position: relative;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  gap: var(--spacing-2xl);
}

.header-left {
  display: flex;
  align-items: center;
  flex: 1;
  gap: var(--spacing-lg);
  min-width: 0;
}

.hamburger-btn {
  flex-shrink: 0;
}

.search-container {
  flex: 1;
  min-width: 200px;
  max-width: 800px;
}

.search-input {
  width: 100%;
}

.header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--spacing-md);
}

.header-icon-btn {
  color: var(--icon-secondary);
  transition: var(--transition-fast);
  flex-shrink: 0;
  height: 32px;
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-icon-btn:hover {
  color: var(--text-primary);
}

.user-avatar {
  cursor: pointer;
  flex-shrink: 0;
  height: 32px !important;
  width: 32px !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Remove default spacing from n-space */
.header-right :deep(.n-space) {
  gap: var(--spacing-md) !important;
  align-items: center !important;
  height: 100%;
}

.header-right :deep(.n-space > .n-space-item) {
  display: flex;
  align-items: center;
  height: 32px;
}

/* User menu styles */
:deep(.user-menu-header) {
  padding: var(--spacing-md) var(--spacing-lg);
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

:deep(.user-email-main) {
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-base);
  color: var(--text-primary);
  line-height: var(--line-height-tight);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

/* Mobile styles */
@media (max-width: 768px) {
  .header {
    padding: 0 16px;
  }

  .header-content {
    gap: 16px;
    transition: gap 0.25s ease;
  }

  .header-content.search-expanded {
    gap: 0;
  }

  .header-left {
    transition: flex 0.25s ease;
  }

  .header-left.search-expanded {
    flex: 1;
    max-width: 100%;
  }

  .search-container {
    min-width: 150px;
    max-width: none;
    transition: all 0.25s ease;
  }

  .search-container.expanded {
    position: absolute;
    left: 12px;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    flex: none;
    min-width: unset;
    max-width: unset;
    width: calc(100% - 24px);
    z-index: 1001;
  }

  .search-input {
    font-size: 14px;
  }

  .hamburger-btn {
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }

  .hamburger-btn.hidden {
    opacity: 0;
    transform: scale(0.8);
    pointer-events: none;
    width: 0;
    min-width: 0;
    padding: 0;
    margin: 0;
  }

  .header-right {
    gap: 8px;
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }

  .header-right.hidden {
    opacity: 0;
    transform: scale(0.8);
    pointer-events: none;
    width: 0;
    min-width: 0;
    overflow: hidden;
  }

  .header-right :deep(.n-space) {
    gap: 8px !important;
    align-items: center !important;
  }

  .header-icon-btn {
    height: 28px;
    width: 28px;
  }

  .user-avatar {
    height: 28px !important;
    width: 28px !important;
  }
}
</style>
