<template>
  <div
    v-if="isActive"
    ref="menuElement"
    class="gap-menu"
    :class="menuPositionClass"
    @click.stop
    @mousedown.stop
  >
    <n-button
      class="menu-close"
      size="tiny"
      circle
      quaternary
      @click.stop="$emit('close')"
      aria-label="Close"
    >
      <template #icon>
        <n-icon>
          <CloseOutline />
        </n-icon>
      </template>
    </n-button>

    <n-button class="menu-option" @click.stop="$emit('add')">
      <template #icon>
        <n-icon color="primary"><AddOutline /></n-icon>
      </template>
      Add photo
    </n-button>

    <n-button
      class="menu-option"
      :class="{ expanded: showSuggestSubmenu }"
      @click.stop="$emit('toggle-suggest')"
    >
      <template #icon>
        <NIcon color="orange"><SparklesOutline /></NIcon>
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
        @click.stop="$emit('select-and-suggest', option.value)"
      >
        {{ option.label }}
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { NButton, NIcon } from "naive-ui";
import { AddOutline, CloseOutline, SparklesOutline } from "@vicons/ionicons5";
import { ref, computed, onMounted, watch } from "vue";

const menuElement = ref(null);
const isOffsetLeft = ref(false);
const isOffsetRight = ref(false);

const props = defineProps({
  isActive: {
    type: Boolean,
    required: true,
  },
  showSuggestSubmenu: {
    type: Boolean,
    required: true,
  },
  suggestionCriteria: {
    type: String,
    required: true,
  },
  suggestionCriteriaOptions: {
    type: Array,
    required: true,
  },
});

defineEmits(["add", "close", "toggle-suggest", "select-and-suggest"]);

const menuPositionClass = computed(() => ({
  "offset-left": isOffsetLeft.value,
  "offset-right": isOffsetRight.value,
}));

const checkMenuPosition = () => {
  if (!menuElement.value) return;

  // Get the menu's bounding rectangle
  const menuRect = menuElement.value.getBoundingClientRect();

  // Get the scrollable container
  const scrollContainer = menuElement.value.closest(".strip-scrollbar");
  let containerRect = null;

  if (scrollContainer) {
    containerRect = scrollContainer.getBoundingClientRect();
  } else {
    // Fallback to window dimensions
    containerRect = {
      left: 0,
      right: window.innerWidth,
    };
  }

  // Check if menu is too close to left edge
  const leftMargin = 20; // Minimum margin from edge
  if (menuRect.left - containerRect.left < leftMargin) {
    isOffsetLeft.value = true;
    isOffsetRight.value = false;
  }
  // Check if menu is too close to right edge
  else if (containerRect.right - menuRect.right < leftMargin) {
    isOffsetRight.value = true;
    isOffsetLeft.value = false;
  } else {
    isOffsetLeft.value = false;
    isOffsetRight.value = false;
  }
};

onMounted(() => {
  // Check position after the element is rendered
  setTimeout(checkMenuPosition, 0);
});

watch(
  () => menuElement.value,
  () => {
    setTimeout(checkMenuPosition, 0);
  }
);

watch(
  () => props.isActive,
  (newVal) => {
    if (newVal) {
      // When menu becomes active, recalculate position
      setTimeout(checkMenuPosition, 50);
    }
  }
);
</script>

<style scoped>
.gap-menu {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  min-width: 180px;
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  animation: menuSlideIn 0.2s ease;
  transition: left 0.2s ease;
  white-space: nowrap;
}

@keyframes menuSlideIn {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.menu-close {
  position: absolute;
  top: -10px;
  right: -10px;
  z-index: 101;
  background: var(--bg-surface, #1f1f23);
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.menu-close:hover {
  background: var(--bg-surface, #1f1f23);
}

.menu-option {
  width: 100%;
  justify-content: center;
  text-align: left;
  padding: 10px 16px;
  display: flex;
  font-size: 14px;
  border-radius: 8px;
  background: transparent;
  transition: all 0.15s ease;
}

.menu-option:hover {
  background: rgba(255, 255, 255, 0.08);
}

.menu-option.expanded {
  background: rgba(37, 99, 235, 0.15);
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

.gap-menu.offset-left {
  left: calc(50% + 110px);
}

.gap-menu.offset-right {
  left: calc(50% - 110px);
}

.submenu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-top: 4px;
  animation: submenuSlideIn 0.15s ease;
}

@keyframes submenuSlideIn {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 200px;
  }
}

.submenu-option {
  width: 100%;
  justify-content: flex-start;
  padding: 8px 12px;
  font-size: 13px;
  border-radius: 6px;
}

.submenu-option:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
