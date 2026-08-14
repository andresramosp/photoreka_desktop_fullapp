<template>
  <div v-if="visibleActions.length > 0" class="chat-action-suggestions">
    <div class="action-suggestions-title">
      <n-icon :size="12" class="action-suggestions-title-icon">
        <SparklesOutline />
      </n-icon>
      <span>{{ title }}</span>
    </div>
    <div class="action-suggestions-row" :class="{ 'is-stacked': isMobile }">
      <button
        v-if="canScrollLeft && !isMobile"
        type="button"
        class="action-suggestions-nav action-suggestions-nav-left"
        aria-label="Scroll left"
        @click="scrollByStep(-1)"
      >
        <n-icon :size="14"><ChevronBackOutline /></n-icon>
      </button>
      <div
        ref="scrollRef"
        class="action-suggestions-scroll"
        :class="{
          'is-fade-left': canScrollLeft && !isMobile,
          'is-fade-right': canScrollRight && !isMobile,
        }"
        @scroll.passive="updateScrollFade"
      >
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
              class="action-chip"
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
              <span class="action-chip-label">{{ labelFor(action) }}</span>
            </n-button>
          </template>
          {{ tooltipFor(action) }}
        </n-tooltip>
      </div>
      <button
        v-if="canScrollRight && !isMobile"
        type="button"
        class="action-suggestions-nav action-suggestions-nav-right"
        aria-label="Scroll right"
        @click="scrollByStep(1)"
      >
        <n-icon :size="14"><ChevronForwardOutline /></n-icon>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted } from "vue";
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
  ChevronBackOutline,
  ChevronForwardOutline,
} from "@vicons/ionicons5";

const props = defineProps({
  actions: {
    type: Array,
    default: () => [],
  },
  title: {
    type: String,
    default: "Suggested actions",
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
const scrollRef = ref(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

const updateScrollFade = () => {
  const el = scrollRef.value;
  if (!el || isMobile.value) return;
  canScrollLeft.value = el.scrollLeft > 1;
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
};

const scrollByStep = (dir) => {
  const el = scrollRef.value;
  if (!el) return;
  // Instant jump to the edge: smooth scroll gets aborted mid-flight by the
  // per-tick mask-class toggle, so a single atomic assignment is reliable.
  el.scrollLeft = dir < 0 ? 0 : el.scrollWidth - el.clientWidth;
  updateScrollFade();
};

watch(visibleActions, () => {
  nextTick(updateScrollFade);
});

onMounted(() => {
  nextTick(updateScrollFade);
});

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
  if (action.icon) return action.icon;
  if (action.type === "open_view") {
    return OPEN_VIEW_ICONS[action?.params?.view] || ArrowForwardOutline;
  }
  return ICONS[action.type] || ArrowForwardOutline;
};

// Phase 3 actions carry only { type, params }, so their wording is composed from
// a fixed per-type template — that is what makes a mislabeled CTA impossible.
// Actions declared by a chat template are already written in front-end code, so
// they bring their own wording and skip the composer rather than fake a type.
const labelFor = (action) => action?.label ?? buildActionLabel(action);
const tooltipFor = (action) => action?.tooltip ?? buildActionTooltip(action);

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
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  min-width: 0;
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

.action-suggestions-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.action-suggestions-row.is-stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.action-suggestions-nav {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
}

.action-suggestions-nav:hover {
  color: var(--accent-color);
  border-color: var(--accent-color);
}

.action-suggestions-scroll {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black 0,
    black 100%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    black 0,
    black 100%,
    transparent 100%
  );
}

.action-suggestions-scroll.is-fade-left {
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black 16px,
    black 100%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    black 16px,
    black 100%,
    transparent 100%
  );
}

.action-suggestions-scroll.is-fade-right {
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black 0,
    black calc(100% - 16px),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    black 0,
    black calc(100% - 16px),
    transparent 100%
  );
}

.action-suggestions-scroll.is-fade-left.is-fade-right {
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black 16px,
    black calc(100% - 16px),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    black 16px,
    black calc(100% - 16px),
    transparent 100%
  );
}

.action-suggestions-scroll::-webkit-scrollbar {
  display: none;
}

.is-stacked .action-suggestions-scroll {
  flex-direction: column;
  align-items: stretch;
  overflow: visible;
  mask-image: none;
  -webkit-mask-image: none;
  gap: 6px;
}

.action-chip {
  flex: 0 0 auto;
  padding: 0 8px;
}

.is-stacked .action-chip {
  width: 100%;
  justify-content: flex-start;
}

.action-chip :deep(.n-button__icon) {
  margin-right: 4px;
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
