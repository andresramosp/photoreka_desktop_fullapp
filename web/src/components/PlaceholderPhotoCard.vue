<template>
  <div
    class="placeholder-photo-card"
    :class="{ compact: isCompact }"
    :style="cardStyle"
  >
    <!-- Remove/Close Button Overlay (always visible) -->
    <div class="placeholder-overlay">
      <n-button :size="isCompact ? 'tiny' : 'small'" @click.stop="handleClose">
        <template #icon>
          <n-icon><TrashOutline /></n-icon>
        </template>
      </n-button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <SpiralGridLoader variant="primary" :size="40" />
    </div>

    <!-- Menu State. Both views are absolutely stacked inside the viewport so
         they can slide past each other in one move: opening the submenu pushes
         it in from the right, the back arrow reverses the direction. -->
    <div v-else class="menu-content">
      <div class="menu-viewport">
        <Transition :name="menuTransition">
          <!-- Main view -->
          <div v-if="!showSuggestSubmenu" key="main" class="menu-panel">
            <n-button
              type="primary"
              secondary
              block
              :size="isCompact ? 'tiny' : 'medium'"
              @click.stop="handleAdd"
            >
              <template #icon>
                <n-icon><AddOutline /></n-icon>
              </template>
              Add photo
            </n-button>

            <n-button
              type="primary"
              secondary
              block
              :size="isCompact ? 'tiny' : 'medium'"
              @click.stop="toggleSuggestSubmenu"
            >
              <template #icon>
                <n-icon><SparklesOutline /></n-icon>
              </template>
              Get suggestion
            </n-button>
          </div>

          <!-- Suggestion submenu view -->
          <div v-else key="submenu" class="menu-panel submenu-view">
            <div class="submenu-header">
              <n-button
                size="tiny"
                circle
                quaternary
                @click.stop="toggleSuggestSubmenu"
              >
                <template #icon>
                  <n-icon><ArrowBackOutline /></n-icon>
                </template>
              </n-button>
              <span v-if="!isCompact" class="submenu-title"
                >Suggestion type</span
              >
            </div>
            <div class="submenu-list">
              <n-button
                v-for="option in suggestionCriteriaOptions"
                :key="option.value"
                type="primary"
                secondary
                :size="isCompact ? 'tiny' : 'small'"
                @click.stop="handleSuggest(option.value)"
              >
                <template #icon>
                  <n-icon><component :is="option.icon" /></n-icon>
                </template>
                {{ option.label }}
              </n-button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { NButton, NIcon } from "naive-ui";
import SpiralGridLoader from "./SpiralGridLoader.vue";
import {
  AddOutline,
  TrashOutline,
  SparklesOutline,
  ArrowBackOutline,
} from "@vicons/ionicons5";

const props = defineProps({
  size: {
    type: Number,
    default: 450,
  },
  suggestionCriteriaOptions: {
    type: Array,
    required: true,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["add", "close", "suggest"]);

const showSuggestSubmenu = ref(false);

const cardStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  minWidth: `${props.size}px`,
}));

const isCompact = computed(() => props.size < 220);

// Which way the panels slide: forward when entering the submenu, back when
// returning, so the motion always matches the direction of navigation.
const menuTransition = ref("menu-forward");

const toggleSuggestSubmenu = () => {
  menuTransition.value = showSuggestSubmenu.value
    ? "menu-back"
    : "menu-forward";
  showSuggestSubmenu.value = !showSuggestSubmenu.value;
};

const handleAdd = () => {
  emit("add");
};

const handleClose = () => {
  menuTransition.value = "menu-back";
  showSuggestSubmenu.value = false;
  emit("close");
};

const handleSuggest = (criteria) => {
  menuTransition.value = "menu-back";
  showSuggestSubmenu.value = false;
  emit("suggest", criteria);
};
</script>

<style scoped>
.placeholder-photo-card {
  position: relative;
  flex-shrink: 0;
  border-radius: 12px;
  border: 1px dashed var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: auto;
  /* The S/M/L switch changes these px values (inline style), so they are
     interpolated instead of snapping. In grid view the width is overridden to
     100% and the animation is driven by SeriesPhotoGrid's FLIP instead. */
  transition:
    width 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    height 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    min-width 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .placeholder-photo-card {
    transition: none;
  }
}

/* Loading State */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* Menu Content */
.menu-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  width: 100%;
  max-width: 280px;
  /* allow submenu-view to expand to card height */
  align-self: stretch;
}

.compact .menu-content {
  gap: 4px;
  padding: 10px 8px;
}

/* Fixed-size stage for the two menu panels. Because both panels are taken out
   of flow inside it, the card never reflows mid-transition — only the panels
   translate. */
.menu-viewport {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.menu-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.compact .menu-panel {
  gap: 4px;
}

/* Slide: the outgoing panel leaves the way the incoming one arrives, both in
   the same frame, so the swap reads as one movement. */
.menu-forward-enter-active,
.menu-forward-leave-active,
.menu-back-enter-active,
.menu-back-leave-active {
  transition:
    transform 260ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 200ms ease;
}

.menu-forward-enter-from,
.menu-back-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.menu-forward-leave-to,
.menu-back-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .menu-forward-enter-active,
  .menu-forward-leave-active,
  .menu-back-enter-active,
  .menu-back-leave-active {
    transition: opacity 120ms ease;
  }

  .menu-forward-enter-from,
  .menu-forward-leave-to,
  .menu-back-enter-from,
  .menu-back-leave-to {
    transform: none;
  }
}

/* Submenu full view */
.submenu-view {
  padding: 8px;
  gap: 6px;
  overflow: hidden;
}

.submenu-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}

.submenu-title {
  font-size: 12px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.submenu-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.compact .submenu-view {
  padding: 4px 8px 4px 8px;
  gap: 6px;
}

.compact .submenu-header {
  padding-bottom: 2px;
  gap: 2px;
}

.compact .submenu-list {
  gap: 3px;
}

/* Remove Button Overlay (like photos) */
.placeholder-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 10;
}

.compact .placeholder-overlay {
  top: 4px;
  right: 4px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .menu-content {
    padding: 16px;
    max-width: 240px;
  }
}
</style>
