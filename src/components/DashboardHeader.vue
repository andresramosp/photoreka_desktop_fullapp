<template>
  <n-layout-header bordered class="header">
    <div class="header-content">
      <div class="header-left">
        <n-button
          v-if="isMobile"
          quaternary
          circle
          class="hamburger-btn"
          @click="$emit('toggle-mobile-menu')"
        >
          <template #icon>
            <n-icon>
              <MenuOutline />
            </n-icon>
          </template>
        </n-button>

        <div class="search-container">
          <n-input
            disabled
            placeholder="Search photos, projects, collections..."
            class="search-input"
            size="medium"
            clearable
            round
          >
            <template #prefix>
              <n-icon :color="'var(--icon-tertiary)'">
                <SearchIcon />
              </n-icon>
            </template>
          </n-input>
        </div>
      </div>

      <div class="header-right">
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
  SearchOutline as SearchIcon,
  NotificationsOutline as NotificationsIcon,
  SettingsOutline as SettingsIcon,
  MenuOutline,
  PersonOutline as PersonIcon,
  LogOutOutline as LogOutIcon,
  SunnyOutline,
  MoonOutline,
} from "@vicons/ionicons5";
import { useTheme } from "../composables/useTheme.js";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const message = useMessage();
const isMobile = ref(false);

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
          userStore.user?.email || "user@photoreka.app"
        ),
      ]),
    key: "user-info",
    disabled: true,
  },
  {
    type: "divider",
  },
  {
    label: "Profile",
    key: "profile",
    icon: () => h(NIcon, null, { default: () => h(PersonIcon) }),
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
  }

  .search-container {
    min-width: 150px;
    max-width: none;
  }

  .search-input {
    font-size: 14px;
  }

  .header-right {
    gap: 8px;
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
