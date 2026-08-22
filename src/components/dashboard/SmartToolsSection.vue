<template>
  <div class="tools-container" :class="{ 'tools-container--grid': isGrid }">
    <nav class="tools-list" :class="{ 'tools-list--grid': isGrid }">
      <button
        v-for="tool in displayedTools"
        :key="tool.id"
        class="tool-item"
        :class="{
          'tool-item--disabled': appAccessMode === 'blocked',
          'tool-item--grid': isGrid,
        }"
        :disabled="appAccessMode === 'blocked'"
        @click="goToTool(tool)"
      >
        <!-- Grid mode turns the icon into an oversized watermark behind the
             copy; the list keeps the compact leading icon. -->
        <span v-if="isGrid" class="tool-icon-bg" aria-hidden="true">
          <n-icon size="92">
            <component :is="getIconComponent(tool.icon)" />
          </n-icon>
        </span>
        <n-icon v-else size="18" color="var(--primary-color)">
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

const props = withDefaults(
  defineProps<{
    appAccessMode: string;
    isMobileLimitedMode: boolean;
    /** Desktop only: the chat tile is a way back to a panel we are not showing. */
    showChatTool?: boolean;
    /** Desktop only: hidden while the 2D Atlas is already the panel on screen. */
    show2dAtlasTool?: boolean;
    /** Lay the tools out as a 2x2 grid once there are at least 4 to show. */
    grid?: boolean;
  }>(),
  {
    show2dAtlasTool: true,
    grid: false,
  },
);

const router = useRouter();
const userStore = useUserStore();

const canvasCount = ref(0);
const activeCanvasName = ref("");

const chatConversationCount = ref(0);
const recentConversation = ref<{ id: number; title: string | null } | null>(
  null,
);

const smartTools = computed(() =>
  getDashboardSmartTools(props.isMobileLimitedMode ? "mobile" : "desktop", {
    includeChat: props.showChatTool,
    include2dAtlas: props.show2dAtlasTool,
  }),
);

// The 2x2 grid needs 4 tiles to balance — the tool list shifts with what the
// center panel is already showing, so fewer than 4 falls back to the list and
// any extras beyond 4 are dropped from the tail.
const isGrid = computed(() => props.grid && smartTools.value.length >= 4);

const displayedTools = computed(() =>
  isGrid.value ? smartTools.value.slice(0, 4) : smartTools.value,
);

// Naming the piece of work on its own read as a description of the tool
// ("Canvas — Posts IG"), so resuming something is spelled out as such.
const getToolSubtitle = (tool: any) => {
  if (tool.id === "canvas") {
    if (canvasCount.value > 0 && activeCanvasName.value) {
      return `${activeCanvasName.value}`;
    }
    return tool.dashboardSubtitle;
  }

  if (tool.id === "chat") {
    if (chatConversationCount.value > 0 && recentConversation.value) {
      return `Continue with ${recentConversation.value.title || "Untitled"}`;
    }
    return tool.dashboardSubtitle;
  }

  return tool.dashboardSubtitle;
};

const goToTool = (tool: any) => {
  if (
    tool.id === "chat" &&
    chatConversationCount.value > 0 &&
    recentConversation.value
  ) {
    router.push(`/chat-lab/${recentConversation.value.id}`);
    return;
  }

  router.push(tool.dashboardRoute);
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

const loadChatInfo = async () => {
  try {
    if (!userStore.isAuthenticated) return;
    const res = await api.get("/api/conversations");
    const list = res.data?.conversations || [];
    chatConversationCount.value = list.length;
    recentConversation.value = list.length > 0 ? list[0] : null;
  } catch (error) {
    console.error("Error loading chat info:", error);
  }
};

onMounted(() => {
  loadCanvasInfo();
  loadChatInfo();
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
  min-height: 50px;
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

/* ── Grid layout (2x2, first 4 tools) ─────────────────────────────────── */

.tools-container--grid {
  padding: 8px;
}

.tools-list--grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.tool-item--grid {
  position: relative;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 0;
  min-height: 94px;
  padding: 12px;
  overflow: hidden;
  isolation: isolate;
  /* Same hover as the shared .action-card: border colour only. */
  transition: border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Bleeds just past the corner so it reads as background texture rather than an
   oversized icon, while keeping enough of the glyph to stay recognisable. */
.tool-item--grid .tool-icon-bg {
  position: absolute;
  top: 0;
  right: 0;
  z-index: -1;
  display: flex;
  color: var(--primary-color);
  opacity: 0.1;
  transform: translate(8px, -8px);
  pointer-events: none;
}

.tool-item--grid .tool-text {
  flex: none;
  gap: 2px;
  width: 100%;
}

.tool-item--grid .tool-name {
  font-size: 13px;
  font-weight: 600;
}

/* Subtitles run long ("Create AI-powered portfolio presentations"), so the
   narrow tile wraps them instead of truncating to an unreadable stub. */
.tool-item--grid .tool-sub {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  line-height: 1.35;
  min-height: calc(2 * 1.35em);
}

.tool-item--grid .tool-badge-new {
  position: absolute;
  top: 10px;
  left: 12px;
}

/* Phones keep the 2x2 shape — only the breathing room shrinks. */
@media (max-width: 560px) {
  .tools-list--grid {
    gap: 6px;
  }

  .tool-item--grid {
    min-height: 84px;
    padding: 10px;
  }

  /* n-icon writes its size inline, so the watermark is scaled down from the
     corner it hangs off instead. */
  .tool-item--grid .tool-icon-bg {
    transform-origin: top right;
    transform: translate(8px, -8px) scale(0.85);
  }

  .tool-item--grid .tool-badge-new {
    top: 8px;
    left: 10px;
  }
}
</style>
