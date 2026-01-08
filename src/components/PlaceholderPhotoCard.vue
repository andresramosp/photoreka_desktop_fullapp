<template>
  <div class="placeholder-photo-card" :style="cardStyle">
    <!-- Remove/Close Button Overlay (always visible) -->
    <div class="placeholder-overlay">
      <n-button size="small" @click.stop="handleClose">
        <template #icon>
          <n-icon><TrashOutline /></n-icon>
        </template>
      </n-button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <n-spin size="large" />
    </div>

    <!-- Menu State -->
    <div v-else class="menu-content">
      <n-button class="menu-option" @click.stop="handleAdd">
        <template #icon>
          <n-icon color="primary"><AddOutline /></n-icon>
        </template>
        Add photo
      </n-button>

      <n-button
        class="menu-option"
        :class="{ expanded: showSuggestSubmenu }"
        @click.stop="toggleSuggestSubmenu"
      >
        <template #icon>
          <n-icon color="orange"><SparklesOutline /></n-icon>
        </template>
        Get suggestion
        <template #icon-right>
          <n-icon :class="{ rotated: showSuggestSubmenu }">▶</n-icon>
        </template>
      </n-button>

      <div v-if="showSuggestSubmenu" class="submenu">
        <n-button
          v-for="option in suggestionCriteriaOptions"
          :key="option.value"
          class="submenu-option"
          size="small"
          @click.stop="handleSuggest(option.value)"
        >
          {{ option.label }}
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { NButton, NIcon, NSpin } from "naive-ui";
import { AddOutline, TrashOutline, SparklesOutline } from "@vicons/ionicons5";

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
  border: 2px dashed var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  animation: placeholderFadeIn 0.3s ease;
  pointer-events: auto;
}

@keyframes placeholderFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.placeholder-photo-card:hover {
  border-color: #3c3c42;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.placeholder-photo-card:hover .placeholder-overlay {
  opacity: 1;
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
}

/* Remove Button Overlay (like photos) */
.placeholder-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 10;
}

.menu-option {
  width: 100%;
  justify-content: center;
  text-align: left;
  padding: 14px 20px;
  display: flex;
  font-size: 15px;
  border-radius: 8px;
  background: #1f1f23;
  border: 1px solid #2c2c32;
  transition: all 0.15s ease;
}

.menu-option:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: #3c3c42;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.menu-option.expanded {
  background: rgba(37, 99, 235, 0.15);
  border-color: rgba(37, 99, 235, 0.3);
}

.menu-option :deep(.n-button__icon--right) {
  margin-left: auto;
  margin-right: 0;
  transition: transform 0.2s ease;
  font-size: 10px;
}

.menu-option :deep(.n-button__icon--right .rotated) {
  transform: rotate(90deg);
}

.submenu {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #2c2c32;
  border-radius: 8px;
  /* animation: submenuSlideIn 0.2s ease; */
}

@keyframes submenuSlideIn {
  from {
    opacity: 0;
    max-height: 0;
    /* transform: translateY(-10px); */
  }
  to {
    opacity: 1;
    max-height: 300px;
    /* transform: translateY(0); */
  }
}

.submenu-option {
  width: 100%;
  justify-content: center;
  padding: 10px 16px;
  font-size: 14px;
  border-radius: 6px;
  background: #1f1f23;
  transition: all 0.15s ease;
}

.submenu-option:hover {
  background: rgba(255, 255, 255, 0.1);
  /* transform: translateX(4px); */
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
