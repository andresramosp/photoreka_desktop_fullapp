<template>
  <div class="admin-root">
    <!-- Mobile top bar -->
    <header v-if="isMobile" class="admin-topbar">
      <button class="topbar-menu-btn" @click="sidebarOpen = !sidebarOpen">
        <n-icon size="20"><MenuIcon /></n-icon>
      </button>
      <div class="topbar-brand">
        <AppLogo layout="horizontal" :height="24" theme="light" />
      </div>
      <div class="topbar-spacer" />
    </header>

    <!-- Sidebar -->
    <aside
      class="admin-sidebar"
      :class="{ collapsed, 'mobile-open': isMobile && sidebarOpen }"
    >
      <!-- Brand -->
      <div class="sidebar-brand">
        <div class="brand-logo">
          <AppLogo
            v-if="!collapsed"
            :with-claim="true"
            layout="horizontal"
            :height="60"
            theme="light"
          />
          <AppLogo v-else layout="icon" :height="45" theme="light" />
        </div>
      </div>

      <!-- Collapse toggle (desktop only) -->
      <button
        v-if="!isMobile"
        class="collapse-btn"
        @click="collapsed = !collapsed"
      >
        <n-icon size="16">
          <ChevronBackIcon v-if="!collapsed" />
          <ChevronForwardIcon v-else />
        </n-icon>
      </button>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <router-link
          v-for="item in menuItems"
          :key="item.key"
          :to="{ name: item.key }"
          class="nav-item"
          :class="{ active: activeKey === item.key }"
          @click="isMobile && (sidebarOpen = false)"
        >
          <n-icon size="18"><component :is="item.icon" /></n-icon>
          <span v-if="!collapsed || isMobile" class="nav-label">{{
            item.label
          }}</span>
        </router-link>
      </nav>

      <!-- Footer -->
      <div class="sidebar-footer">
        <div
          class="footer-user"
          :class="{ 'collapsed-user': collapsed && !isMobile }"
        >
          <n-avatar
            :size="collapsed && !isMobile ? 28 : 32"
            round
            style="background: #6366f1; font-size: 13px"
          >
            {{ userInitials }}
          </n-avatar>
          <div v-if="!collapsed || isMobile" class="user-info">
            <span class="user-name">{{ userStore.user?.name }}</span>
            <span class="user-email">{{ userStore.user?.email }}</span>
          </div>
        </div>
        <button
          class="logout-btn"
          :class="{ 'collapsed-logout': collapsed && !isMobile }"
          @click="handleLogout"
          title="Logout"
        >
          <n-icon size="16"><LogOutIcon /></n-icon>
          <span v-if="!collapsed || isMobile">Logout</span>
        </button>
      </div>
    </aside>

    <!-- Mobile backdrop -->
    <transition name="fade">
      <div
        v-if="isMobile && sidebarOpen"
        class="mobile-backdrop"
        @click="sidebarOpen = false"
      />
    </transition>

    <!-- Main content -->
    <main class="admin-main" :class="{ 'with-topbar': isMobile, collapsed }">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "@/stores/userStore";
import { useTheme } from "@/composables/useTheme";
import AppLogo from "@/components/AppLogo.vue";
import {
  GridOutline as DashboardIcon,
  AnalyticsOutline as AnalyzerIcon,
  PeopleOutline as UsersIcon,
  WalletOutline as CostsIcon,
  ReceiptOutline as PaymentsIcon,
  PulseOutline as HealthIcon,
  MenuOutline as MenuIcon,
  LogOutOutline as LogOutIcon,
  ChevronBackOutline as ChevronBackIcon,
  ChevronForwardOutline as ChevronForwardIcon,
} from "@vicons/ionicons5";

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const { setTheme, isDarkMode } = useTheme();
// Force light theme immediately (before first render) so CSS variables are correct
// even when navigating from a dark-themed page — onMounted would be too late
const prevDark = isDarkMode.value;
setTheme(false, false);

const sidebarOpen = ref(false);
const isMobile = ref(false);
const collapsed = ref(false);

const menuItems = [
  { label: "Dashboard", key: "admin-dashboard", icon: DashboardIcon },
  { label: "Processes", key: "admin-processes", icon: AnalyzerIcon },
  { label: "Users", key: "admin-users", icon: UsersIcon },
  { label: "Costs", key: "admin-costs", icon: CostsIcon },
  { label: "Payments", key: "admin-payments", icon: PaymentsIcon },
  { label: "Health", key: "admin-health", icon: HealthIcon },
];

const activeKey = computed(() => (route.name as string) || "admin-dashboard");

const userInitials = computed(() => {
  const name = userStore.user?.name || "";
  return name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
});

function handleLogout() {
  userStore.logout();
  router.replace("/auth");
}

function checkMobile() {
  isMobile.value = window.innerWidth < 768;
  if (!isMobile.value) sidebarOpen.value = false;
}

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
  setTheme(prevDark, false); // restore previous theme
});
</script>

<style scoped>
/* ===== Root ===== */
.admin-root {
  display: flex;
  height: 100vh;
  background: #f4f6f8;
  font-family:
    "Work Sans",
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
}

/* ===== Topbar (mobile) ===== */
.admin-topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 52px;
  background: #fff;
  border-bottom: 1px solid #e8ecf0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  z-index: 900;
  gap: 12px;
}
.topbar-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: #f4f6f8;
  border-radius: 8px;
  cursor: pointer;
  color: #374151;
}
.topbar-brand {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.topbar-spacer {
  width: 36px;
}

/* ===== Sidebar ===== */
.admin-sidebar {
  width: 220px;
  min-width: 220px;
  height: 100vh;
  background: #fff;
  border-right: 1px solid #e8ecf0;
  display: flex;
  flex-direction: column;
  position: relative;
  transition:
    width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 950;
}
.admin-sidebar.collapsed {
  width: 68px;
  min-width: 68px;
}

/* Mobile sidebar */
@media (max-width: 767px) {
  .admin-sidebar {
    position: fixed;
    top: 0;
    left: -260px;
    width: 260px;
    min-width: 260px;
    z-index: 1001;
    box-shadow: 4px 0 32px rgba(0, 0, 0, 0.12);
    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .admin-sidebar.mobile-open {
    left: 0;
  }
  .admin-sidebar.collapsed {
    width: 260px;
    min-width: 260px;
  }
}

.mobile-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 1000;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Brand */
.sidebar-brand {
  padding: 12px 12px 12px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
}
.collapsed .sidebar-brand {
  justify-content: center;
  padding: 20px 8px 12px;
}
.brand-logo {
  display: flex;
  align-items: center;
}
.admin-badge {
  font-size: 9px;
  letter-spacing: 0.5px;
  font-weight: 700;
  padding: 0 6px;
  height: 18px;
}
.collapsed .admin-badge {
  display: none;
}

/* Collapse toggle */
.collapse-btn {
  position: absolute;
  top: 28px;
  right: -12px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #e8ecf0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #9ca3af;
  z-index: 10;
  transition: all 0.2s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.collapse-btn:hover {
  color: #6366f1;
  border-color: #c7d2fe;
  background: #f5f3ff;
}

/* Navigation */
.sidebar-nav {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #64748b;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s;
  white-space: nowrap;
  overflow: hidden;
}
.collapsed .nav-item {
  justify-content: center;
  padding: 10px;
}
.nav-item:hover {
  background: #f4f6f8;
  color: #334155;
}
.nav-item.active {
  background: #eff6ff;
  color: #4f46e5;
  font-weight: 600;
}
.nav-item.active:hover {
  background: #e0e7ff;
}
.nav-label {
  transition: opacity 0.2s;
}
.collapsed .nav-label {
  display: none;
}

/* Footer */
.sidebar-footer {
  padding: 12px;
  border-top: 1px solid #f0f2f5;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.footer-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px;
}
.footer-user.collapsed-user {
  justify-content: center;
}
.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-email {
  font-size: 11px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.logout-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: none;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.logout-btn:hover {
  background: #fef2f2;
  color: #ef4444;
}
.logout-btn.collapsed-logout {
  justify-content: center;
  padding: 8px;
}
.collapsed-logout span {
  display: none;
}

/* ===== Main content ===== */
.admin-main {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
  min-width: 0;
  transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.admin-main.with-topbar {
  margin-top: 52px;
  padding: 20px 16px;
}
@media (max-width: 767px) {
  .admin-main {
    width: 100%;
  }
}
</style>
