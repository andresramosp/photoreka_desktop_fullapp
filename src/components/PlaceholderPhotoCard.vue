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

    <!-- Menu State -->
    <div v-else class="menu-content">
      <!-- Main view -->
      <template v-if="!showSuggestSubmenu">
        <n-button class="menu-option" @click.stop="handleAdd">
          <template #icon>
            <n-icon color="primary"><AddOutline /></n-icon>
          </template>
          Add photo
        </n-button>

        <n-button class="menu-option" @click.stop="toggleSuggestSubmenu">
          <template #icon>
            <n-icon color="orange"><SparklesOutline /></n-icon>
          </template>
          Get suggestion
        </n-button>
      </template>

      <!-- Suggestion submenu view -->
      <div v-else class="submenu-view">
        <div class="submenu-header">
          <n-button size="tiny" circle text @click.stop="toggleSuggestSubmenu">
            <template #icon>
              <n-icon><ArrowBackOutline /></n-icon>
            </template>
          </n-button>
          <span v-if="!isCompact" class="submenu-title">Suggestion type</span>
        </div>
        <div class="submenu-list">
          <n-button
            v-for="option in suggestionCriteriaOptions"
            :key="option.value"
            class="submenu-option"
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

const toggleSuggestSubmenu = () => {
  showSuggestSubmenu.value = !showSuggestSubmenu.value;
};

const handleAdd = () => {
  emit("add");
};

const handleClose = () => {
  showSuggestSubmenu.value = false;
  emit("close");
};

const handleSuggest = (criteria) => {
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
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
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

/* Submenu full view */
.submenu-view {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: 100%;
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
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.submenu-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.compact .submenu-view {
  padding: 4px 4px 4px 2px;
  gap: 2px;
}

.compact .submenu-header {
  padding-bottom: 2px;
  gap: 2px;
}

.compact .submenu-list {
  gap: 2px;
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

.menu-option {
  width: 100%;
  justify-content: center;
  text-align: left;
  padding: 14px 20px;
  display: flex;
  font-size: 15px;
  border-radius: 8px;
  background: var(--bg-container);
  border: 1px solid var(--border-color);
}

.compact .menu-option {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 6px;
}

.submenu-option {
  width: 100%;
  justify-content: center;
  border-radius: 6px;
  background: var(--bg-container);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .menu-content {
    padding: 16px;
    max-width: 240px;
  }

  .menu-option {
    padding: 12px 16px;
    font-size: 14px;
  }

  .submenu-option {
    padding: 8px 12px;
    font-size: 13px;
  }
}
</style>
