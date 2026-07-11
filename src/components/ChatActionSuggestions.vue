<template>
  <div v-if="visibleActions.length > 0" class="chat-action-suggestions">
    <div class="action-suggestions-title">
      <n-icon :size="12" class="action-suggestions-title-icon">
        <SparklesOutline />
      </n-icon>
      <span>Suggested actions</span>
    </div>
    <n-tooltip
      v-for="(action, idx) in visibleActions"
      :key="idx"
      trigger="hover"
      placement="top"
      :show-arrow="true"
      :disabled="isActionDisabled(action, idx)"
    >
      <template #trigger>
        <n-button
          type="info"
          secondary
          round
          size="small"
          :disabled="isActionDisabled(action, idx)"
          @click="handleClick(action, idx)"
          @mouseenter="emitHoverPhotos(action, idx)"
          @mouseleave="clearHoverPhotos()"
          @focus="emitHoverPhotos(action, idx)"
          @blur="clearHoverPhotos()"
        >
          <template #icon>
            <n-icon :size="14" class="action-chip-icon">
              <SpiralGridLoader
                v-if="runningIndex === idx"
                variant="primary"
                :size="14"
              />
              <component :is="iconFor(action)" v-else />
            </n-icon>
          </template>
          <span class="action-chip-label">{{ buildActionLabel(action) }}</span>
        </n-button>
      </template>
      {{ buildActionTooltip(action) }}
    </n-tooltip>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { NButton, NIcon, NTooltip } from "naive-ui";
import { useIsMobile } from "@/composables/useIsMobile.js";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import {
  buildActionLabel,
  buildActionTooltip,
} from "@/utils/chatActionLabels.js";
import { Workspace, WordCloud } from "@vicons/carbon";
import {
  GridOutline,
  LayersOutline,
  ListOutline,
  EyeOutline,
  AnalyticsOutline,
  BriefcaseOutline,
  EarthOutline,
  ArrowForwardOutline,
  SparklesOutline,
  SearchOutline,
} from "@vicons/ionicons5";

const props = defineProps({
  actions: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["execute", "hover-photos", "clear-hover-photos"]);

const { isMobile } = useIsMobile();

const MOBILE_HIDDEN_ACTION_TYPES = new Set([
  "create_series",
  "add_to_series",
  "create_canvas",
]);
const MOBILE_HIDDEN_OPEN_VIEWS = new Set(["series", "series-list"]);

const isMobileHiddenAction = (action) =>
  MOBILE_HIDDEN_ACTION_TYPES.has(action?.type) ||
  (action?.type === "open_view" &&
    MOBILE_HIDDEN_OPEN_VIEWS.has(action?.params?.view));

const visibleActions = computed(() =>
  isMobile.value
    ? (props.actions || []).filter((a) => !isMobileHiddenAction(a))
    : props.actions || [],
);

const runningIndex = ref(-1);

const ICONS = {
  create_collection: GridOutline,
  create_series: ListOutline,
  create_canvas: Workspace,
  add_to_collection: GridOutline,
  add_to_series: ListOutline,
  search_photos: SearchOutline,
  open_workspace: LayersOutline,
  view_photo: EyeOutline,
  open_view: ArrowForwardOutline,
};

const OPEN_VIEW_ICONS = {
  portfolio: BriefcaseOutline,
  collection: GridOutline,
  series: ListOutline,
  report: AnalyticsOutline,
  portfolios: BriefcaseOutline,
  collections: GridOutline,
  "series-list": ListOutline,
  "world-map": EarthOutline,
  tagcloud: WordCloud,
};

const iconFor = (action) => {
  if (!action) return ArrowForwardOutline;
  if (action.type === "open_view") {
    return OPEN_VIEW_ICONS[action?.params?.view] || ArrowForwardOutline;
  }
  return ICONS[action.type] || ArrowForwardOutline;
};

const isActionDisabled = (action, idx) =>
  runningIndex.value === idx || action?.used === true;

const emitHoverPhotos = (action, idx) => {
  if (isActionDisabled(action, idx)) return;
  emit("hover-photos", action);
};

const clearHoverPhotos = () => {
  emit("clear-hover-photos");
};

const handleClick = async (action, idx) => {
  if (isActionDisabled(action, idx)) return;
  runningIndex.value = idx;
  try {
    await emit("execute", action);
  } finally {
    // Navigation-based actions unmount this anyway; reset for in-place ones.
    runningIndex.value = -1;
  }
};
</script>

<style scoped>
.chat-action-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.action-suggestions-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.action-suggestions-title-icon {
  display: inline-flex;
}

.action-chip-icon {
  color: var(--accent-color);
  display: inline-flex;
}

.action-chip-label {
  white-space: nowrap;
  font-size: 11px;
}
</style>
