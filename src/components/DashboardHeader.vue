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
          <div class="search-and-tabs">
            <GlobalSearchAutocomplete
              class="header-search"
              @search-focus="handleSearchFocus"
              @search-blur="handleSearchBlur"
            />

            <div
              v-if="tabs.length"
              class="route-tabs-wrapper"
              ref="tabsWrapperRef"
            >
              <n-tabs
                class="route-tabs"
                type="card"
                size="small"
                :value="activeTabKey"
                closable
                animated
                @update:value="openTab"
                @close="closeTab"
              >
                <template v-if="canScrollLeft" #prefix>
                  <button
                    class="tabs-scroll-btn"
                    @click="scrollTabs('left')"
                    aria-label="Scroll tabs left"
                    type="button"
                  >
                    <n-icon size="15"><ChevronBackOutline /></n-icon>
                  </button>
                </template>
                <n-tab-pane
                  v-for="tab in tabs"
                  :key="tab.key"
                  :name="tab.key"
                  :closable="tab.closable"
                >
                  <template #tab>
                    <span class="route-tab-label">
                      <n-icon
                        v-if="tab.toolId"
                        size="14"
                        class="route-tab-icon"
                      >
                        <component
                          :is="getIconComponent(getToolById(tab.toolId)?.icon)"
                        />
                      </n-icon>
                      <span
                        class="route-tab-text"
                        :data-route-tab-key="tab.key"
                      >
                        {{ tab.title }}
                      </span>
                      <span
                        v-if="tabDirtyStore.dirtyTabKeys.has(tab.key)"
                        class="route-tab-dirty-dot"
                        title="Unsaved changes"
                      />
                    </span>
                  </template>
                </n-tab-pane>
                <template v-if="canScrollRight" #suffix>
                  <button
                    class="tabs-scroll-btn"
                    @click="scrollTabs('right')"
                    aria-label="Scroll tabs right"
                    type="button"
                  >
                    <n-icon size="15"><ChevronForwardOutline /></n-icon>
                  </button>
                </template>
              </n-tabs>
            </div>
          </div>
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
          <a
            href="https://www.photoreka.com"
            target="_blank"
            rel="noopener noreferrer"
            style="display: flex; align-items: center"
          >
            <AppLogo layout="horizontal" />
          </a>
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

  <!-- Global unsaved-changes confirmation when closing a dirty tab -->
  <n-modal
    v-model:show="showUnsavedCloseModal"
    preset="dialog"
    title="Unsaved Changes"
    positive-text="Save & Close"
    negative-text="Close Without Saving"
    type="warning"
    :mask-closable="false"
    style="width: 480px"
    @positive-click="handleSaveAndCloseTab"
    @negative-click="handleCloseTabWithoutSaving"
    @close="handleCancelTabClose"
  >
    <p>This tab has unsaved changes. What would you like to do?</p>
  </n-modal>
</template>

<script setup lang="ts">
import { h, ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import { NIcon, useMessage, NModal } from "naive-ui";
import { useUserStore } from "../stores/userStore";
import { getIconComponent, getToolById } from "@/config/toolsConfig";
import { useTabDirtyStore } from "@/stores/tabDirtyStore";

// Import @vicons icons from ionicons5 for reliability
import {
  SettingsOutline as SettingsIcon,
  MenuOutline,
  LogOutOutline as LogOutIcon,
  SunnyOutline,
  MoonOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
} from "@vicons/ionicons5";
import { useTheme } from "../composables/useTheme.js";
import { useRouteTabs } from "@/composables/useRouteTabs";
import GlobalSearchAutocomplete from "./GlobalSearchAutocomplete.vue";
import AppLogo from "./AppLogo.vue";

const router = useRouter();
const userStore = useUserStore();
const message = useMessage();
const isMobile = ref(false);
const searchExpanded = ref(false);

// Theme management
const { themeMode, toggleTheme, canToggleTheme } = useTheme();
const { tabs, activeTabKey, openTab, closeTab, forceCloseTab } = useRouteTabs();
const tabDirtyStore = useTabDirtyStore();

const tabsWrapperRef = ref<HTMLElement | null>(null);
const hasTabOverflow = ref(false);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
const TAB_EDGE_SNAP_DISTANCE = 72;
let scrollSnapTimeout: number | null = null;

function getTabsScrollEl(): HTMLElement | null {
  return tabsWrapperRef.value?.querySelector(".v-x-scroll") ?? null;
}

function getTabsMaxScroll(el: HTMLElement): number {
  return Math.max(el.scrollWidth - el.clientWidth, 0);
}

function snapTabsScrollTarget(el: HTMLElement, left: number): number {
  const maxScroll = getTabsMaxScroll(el);
  if (left <= TAB_EDGE_SNAP_DISTANCE) return 0;
  if (maxScroll - left <= TAB_EDGE_SNAP_DISTANCE) return maxScroll;
  return left;
}

function snapCurrentTabsScrollToEdge(el: HTMLElement) {
  el.scrollLeft = snapTabsScrollTarget(el, el.scrollLeft);
}

function getActiveTabEl(): HTMLElement | null {
  if (!activeTabKey.value || !tabsWrapperRef.value) return null;
  const selector = `[data-route-tab-key="${CSS.escape(activeTabKey.value)}"]`;
  return (
    tabsWrapperRef.value.querySelector(selector)?.closest(".n-tabs-tab") ?? null
  );
}

function getTabsScrollStep(el: HTMLElement): number {
  return Math.max(Math.floor(el.clientWidth * 0.75), 160);
}

function revealActiveTab() {
  requestAnimationFrame(() => {
    const el = getTabsScrollEl();
    const activeTabEl = getActiveTabEl();
    if (!el || !activeTabEl) {
      updateScrollState();
      return;
    }

    const scrollRect = el.getBoundingClientRect();
    const tabRect = activeTabEl.getBoundingClientRect();
    const revealPadding = 8;
    let target = el.scrollLeft;

    if (tabRect.left < scrollRect.left) {
      target += tabRect.left - scrollRect.left - revealPadding;
    } else if (tabRect.right > scrollRect.right) {
      target += tabRect.right - scrollRect.right + revealPadding;
    } else {
      updateScrollState();
      return;
    }

    const maxScroll = getTabsMaxScroll(el);
    const boundedTarget = Math.min(Math.max(target, 0), maxScroll);
    const snappedTarget = snapTabsScrollTarget(el, boundedTarget);
    if (scrollSnapTimeout !== null) {
      window.clearTimeout(scrollSnapTimeout);
    }
    el.scrollTo({ left: snappedTarget, behavior: "smooth" });
    scrollSnapTimeout = window.setTimeout(() => {
      updateScrollState();
      scrollSnapTimeout = null;
    }, 320);
  });
}

async function settleTabsScrollState() {
  await nextTick();
  requestAnimationFrame(() => {
    const el = getTabsScrollEl();
    if (!el) return;
    snapCurrentTabsScrollToEdge(el);
    updateScrollState();
  });
}

function updateScrollState() {
  const el = getTabsScrollEl();
  if (!el) {
    hasTabOverflow.value = false;
    canScrollLeft.value = false;
    canScrollRight.value = false;
    return;
  }
  const maxScroll = getTabsMaxScroll(el);
  hasTabOverflow.value = maxScroll > 1;
  canScrollLeft.value = hasTabOverflow.value && el.scrollLeft > 1;
  canScrollRight.value = hasTabOverflow.value && el.scrollLeft < maxScroll - 1;
}

function scrollTabs(dir: "left" | "right") {
  const el = getTabsScrollEl();
  if (!el) return;
  const maxScroll = getTabsMaxScroll(el);
  const currentScroll = Math.min(Math.max(el.scrollLeft, 0), maxScroll);
  const scrollStep = getTabsScrollStep(el);
  const target =
    dir === "right"
      ? Math.min(currentScroll + scrollStep, maxScroll)
      : Math.max(currentScroll - scrollStep, 0);

  if (Math.abs(target - currentScroll) <= 1) return;
  const snappedTarget = snapTabsScrollTarget(el, target);
  if (scrollSnapTimeout !== null) {
    window.clearTimeout(scrollSnapTimeout);
  }
  el.scrollTo({ left: snappedTarget, behavior: "smooth" });
  scrollSnapTimeout = window.setTimeout(() => {
    el.scrollLeft = snappedTarget;
    updateScrollState();
    void settleTabsScrollState();
    scrollSnapTimeout = null;
  }, 320);
}

let scrollEl: HTMLElement | null = null;
let scrollContentEl: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;

function bindTabsScroll() {
  scrollEl = getTabsScrollEl();
  if (!scrollEl) return;
  scrollContentEl = scrollEl.querySelector(".n-tabs-nav-scroll-content");
  scrollEl.addEventListener("scroll", updateScrollState, { passive: true });
  resizeObserver = new ResizeObserver(updateScrollState);
  resizeObserver.observe(scrollEl);
  if (scrollContentEl) {
    resizeObserver.observe(scrollContentEl);
  }
  updateScrollState();
  requestAnimationFrame(updateScrollState);
}

function unbindTabsScroll() {
  scrollEl?.removeEventListener("scroll", updateScrollState);
  resizeObserver?.disconnect();
  scrollEl = null;
  scrollContentEl = null;
  resizeObserver = null;
}

watch(
  [
    () => tabs.value.map((tab) => tab.key).join("|"),
    () => tabs.value.map((tab) => `${tab.key}:${tab.title}`).join("|"),
    activeTabKey,
  ],
  async (
    [currentTabKeys, _currentTabTitles, currentActiveTabKey],
    [previousTabKeys],
  ) => {
    const currentKeys = new Set(currentTabKeys.split("|").filter(Boolean));
    const previousKeys = new Set(previousTabKeys.split("|").filter(Boolean));
    const shouldRevealActiveTab =
      !!currentActiveTabKey &&
      currentKeys.has(currentActiveTabKey) &&
      !previousKeys.has(currentActiveTabKey);

    await nextTick();
    unbindTabsScroll();
    bindTabsScroll();
    if (shouldRevealActiveTab) {
      revealActiveTab();
    }
  },
  { flush: "post" },
);

const showUnsavedCloseModal = computed(
  () => tabDirtyStore.pendingCloseKey !== null,
);

const handleSaveAndCloseTab = async () => {
  const key = tabDirtyStore.pendingCloseKey;
  if (!key) return;
  const callbacks = tabDirtyStore.getCallbacks(key);
  if (callbacks?.save) {
    await callbacks.save();
  }
  await forceCloseTab(key);
};

const handleCloseTabWithoutSaving = async () => {
  const key = tabDirtyStore.pendingCloseKey;
  if (!key) return;
  const callbacks = tabDirtyStore.getCallbacks(key);
  callbacks?.discard?.();
  await forceCloseTab(key);
};

const handleCancelTabClose = () => {
  tabDirtyStore.clearPendingClose();
};

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

onMounted(async () => {
  checkIsMobile();
  window.addEventListener("resize", checkIsMobile);
  await nextTick();
  bindTabsScroll();
});

onUnmounted(() => {
  window.removeEventListener("resize", checkIsMobile);
  if (scrollSnapTimeout !== null) {
    window.clearTimeout(scrollSnapTimeout);
  }
  unbindTabsScroll();
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
  min-width: 420px;
  max-width: none;
}

.search-and-tabs {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
}

.header-search {
  flex: 0 1 560px;
  min-width: 260px;
}

.route-tabs-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.route-tabs {
  flex: 1;
  min-width: 0;
  width: 100%;
}

.route-tabs :deep(.n-tabs-nav) {
  --n-tab-gap: 8px;
}

.route-tabs :deep(.n-tabs-nav__prefix) {
  padding-right: 6px;
}

.route-tabs :deep(.n-tabs-nav__suffix) {
  padding-left: 6px;
}

.route-tabs :deep(.n-tabs-tab) {
  max-width: 220px;
  background: color-mix(in srgb, var(--bg-surface) 85%, transparent);
  border-color: var(--border-color);
}

.route-tabs :deep(.n-tabs-tab__label) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  user-select: none;
  -webkit-user-select: none;
}

.route-tab-icon {
  flex-shrink: 0;
}

.route-tab-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
}

.route-tab-dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--warning-color, #f0a020);
  display: inline-block;
  flex-shrink: 0;
  margin-left: 2px;
}

.route-tabs :deep(.n-tabs-pane-wrapper) {
  display: none;
}

.tabs-scroll-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  color: var(--text-primary);
  cursor: pointer;
  padding: 0;
  transition:
    border-color 0.15s,
    color 0.15s,
    background 0.15s;
}

.tabs-scroll-btn:hover {
  border-color: color-mix(in srgb, var(--primary-color) 50%, transparent);
  color: var(--primary-color);
  background: color-mix(in srgb, var(--bg-card) 96%, transparent);
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

  .search-and-tabs {
    gap: 8px;
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
