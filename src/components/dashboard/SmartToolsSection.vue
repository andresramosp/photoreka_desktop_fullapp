<template>
  <div class="tools-container">
    <nav class="tools-list">
      <button
        v-for="tool in smartTools"
        :key="tool.id"
        class="tool-item"
        :class="{ 'tool-item--disabled': appAccessMode === 'blocked' }"
        :disabled="appAccessMode === 'blocked'"
        @click="goToTool(tool.dashboardRoute)"
      >
        <n-icon size="18" color="var(--primary-color)">
          <component :is="getIconComponent(tool.icon)" />
        </n-icon>
        <div class="tool-text">
          <span class="tool-name">{{ tool.dashboardName }}</span>
          <span class="tool-sub">{{ getToolSubtitle(tool) }}</span>
        </div>
        <span v-if="tool.dashboardBadgeNew" class="tool-badge-new">NEW</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/userStore.js";
import { api } from "@/utils/axios.js";
import {
  getDashboardSmartTools,
  getIconComponent,
} from "@/config/toolsConfig.js";

defineOptions({
  name: "SmartToolsSection",
});

const props = defineProps<{
  appAccessMode: string;
  isMobileLimitedMode: boolean;
}>();

const router = useRouter();
const userStore = useUserStore();

const canvasCount = ref(0);
const activeCanvasName = ref("");

const smartTools = computed(() =>
  getDashboardSmartTools(props.isMobileLimitedMode ? "mobile" : "desktop"),
);

const getToolSubtitle = (tool: any) => {
  if (tool.id !== "canvas") {
    return tool.dashboardSubtitle;
  }

  if (canvasCount.value > 0) {
    return activeCanvasName.value || tool.dashboardSubtitle;
  }

  return tool.dashboardSubtitle;
};

const goToTool = (route: string) => {
  router.push(route);
};

const loadCanvasInfo = async () => {
  try {
    if (userStore.isAuthenticated) {
      const res = await api.get("/api/canvas");
      const list = res.data || [];
      canvasCount.value = list.length;
      if (list.length > 0) {
        const activeId = localStorage.getItem("photoreka_active_canvas_id");
        const active = activeId
          ? list.find((c: any) => String(c.id) === String(activeId))
          : null;
        activeCanvasName.value = (active || list[0]).name || "My Canvas";
      }
      return;
    }

    const savedCanvas = localStorage.getItem("photoreka_canvas_data");
    canvasCount.value = savedCanvas ? 1 : 0;
    activeCanvasName.value = savedCanvas ? "My Canvas" : "";
  } catch (error) {
    console.error("Error loading canvas info:", error);
  }
};

onMounted(() => {
  loadCanvasInfo();
});
</script>

<style scoped>
.tools-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tools-container {
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 10px;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-surface);
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.tool-item:hover {
  border-color: var(--primary-color);
}

.tool-item--disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.tool-item--disabled:hover {
  background-color: transparent;
}

.tool-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.tool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-sub {
  font-size: 10px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-badge-new {
  flex-shrink: 0;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary-color);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 5px;
}
</style>
