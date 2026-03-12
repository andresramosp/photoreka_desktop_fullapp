<template>
  <div class="empty-state">
    <div class="empty-content">
      <n-icon
        :size="isMobileDevice() ? 45 : 64"
        color="#6b7280"
        class="empty-icon"
        :component="currentModeIcon"
      />

      <h2 class="empty-title">{{ currentConfig.title }}</h2>
      <p class="empty-description">
        {{ currentConfig.description }}
      </p>
      <div class="instructions-list">
        <div
          v-for="(instruction, index) in currentConfig.instructions"
          :key="index"
          class="instruction-item"
        >
          <n-icon>
            <component :is="iconComponents[instruction.icon]" />
          </n-icon>

          <span v-html="instruction.text"></span>
        </div>
      </div>
      <div class="examples-carousel">
        <span v-if="!isMobileDevice()">Try something like...</span>
        <div class="carousel-container">
          <div class="carousel-item" :class="{ sliding: isSliding }">
            <button class="example-card" @click="handleExampleClick">
              <span class="example-text">«{{ currentText }}»</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toRef, defineProps, computed } from "vue";
import { NIcon } from "naive-ui";
import { isMobileDevice } from "@/utils/utils.js";
import {
  ImagesOutline,
  Language,
  LogOutOutline,
  StarHalf,
  FlashOutline,
  GitBranchOutline,
  LocateOutline,
  BulbOutline,
  ListOutline,
  SearchOutline,
  GlobeOutline,
} from "@vicons/ionicons5";
import { useQueryExamples } from "@/composables/useQueryExamples";

const props = defineProps({
  onExampleClick: {
    type: Function,
    required: true,
  },
  searchMode: {
    type: String,
    default: "broad",
  },
  searchType: {
    type: String,
    default: "semantic",
  },
});

// Configuración de contenido por searchMode
const searchModeConfig = {
  broad: {
    title: "Broad Mode",
    description:
      "A lightweight search that scans broadly across your library. Ideal for quick exploration and high-level discovery.",
    instructions: [
      // {
      //   icon: "FlashOutline",
      //   text: "Your query is embedded into the same vector space as the images for broad similarity matching.",
      // },
      {
        icon: "ImagesOutline",
        text: "Best for <strong> moods </strong>,  <strong> compositional aspects </strong> and  <strong> overall visual style </strong>.",
      },
    ],
  },

  adaptive: {
    title: "Adaptive Mode",
    description:
      "A flexible, context-aware search that adapts to meaning. Your query is automatically enriched with contextual nuances and related concepts.",
    instructions: [
      // {
      //   icon: "BulbOutline",
      //   text: "Your query is automatically enriched with contextual nuances and related concepts.",
      // },
      {
        icon: "GitBranchOutline",
        text: "Ideal for <strong> metaphorical queries </strong>, <strong> cultural references </strong> and <strong> nuanced interpretation </strong>.",
      },
    ],
  },

  precise: {
    title: "Precise Mode",
    description:
      "A focused and analytical search designed for accuracy. Returns results closely aligned with your exact intent.",
    instructions: [
      // {
      //   icon: "LocateOutline",
      //   text: "Your query is carefully analyzed and structured for maximum precision.",
      // },
      {
        icon: "ListOutline",
        text: "Best for <strong> concrete objects </strong> and <strong> more precise taxonomic distinctions </strong>.",
      },
    ],
  },
};

// Obtener configuración actual según searchMode
const currentConfig = computed(() => {
  return searchModeConfig[props.searchMode];
});

// Mapeo de nombres de iconos a componentes
const iconComponents = {
  Language,
  StarHalf,
  LogOutOutline,
  FlashOutline,
  ImagesOutline,
  BulbOutline,
  GitBranchOutline,
  LocateOutline,
  ListOutline,
};

// Mapeo de searchMode a iconos principales
const searchModeIcons = {
  broad: GlobeOutline,
  adaptive: GitBranchOutline,
  precise: LocateOutline,
};

// Obtener icono según searchMode
const currentModeIcon = computed(() => {
  return searchModeIcons[props.searchMode] || FlashOutline;
});

const { currentText, isSliding } = useQueryExamples(
  toRef(props, "searchType"),
  toRef(props, "searchMode"),
);

function handleExampleClick() {
  props.onExampleClick(currentText.value, props.searchType);
}
</script>

<style scoped>
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  text-align: center;
  max-width: 640px;
}

.empty-icon {
  margin-bottom: var(--spacing-lg);
}

.empty-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  margin: 0 0 0 0;
}

@media (max-width: 480px) {
  .empty-title {
    font-size: var(--font-size-xl);
  }
}

.empty-description {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin-top: 10px;
  margin-bottom: 5px;
  line-height: var(--line-height-relaxed);
}

@media (max-width: 480px) {
  .empty-description {
    font-size: 13px;
  }
}

.instructions-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-lg);
  align-content: center;
  justify-content: center;
  align-items: center;
}

.instruction-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 14px;
  color: var(--text-secondary);
}

@media (max-width: 480px) {
  .instruction-item {
    font-size: var(--font-size-sm);
  }
}

.examples-carousel {
  display: flex;
  justify-content: center;
  padding: var(--spacing-sm) 0;
  background-color: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  padding: var(--spacing-lg);
  align-content: center;
  align-items: center;
  flex-direction: column;
  color: var(--text-primary);
}

.carousel-container {
  width: 100%;
  max-width: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.carousel-item {
  width: 100%;
  opacity: 1;
  transform: translateX(0);
  transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.carousel-item.sliding {
  opacity: 0;
  transform: translateX(-80px);
}

.example-card {
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  width: 100%;
  background: transparent;
  border: none;
  padding: 0;
}

.example-card:hover .example-text {
  color: #2563eb;
  transform: scale(1.02);
}

.example-text {
  font-size: 16px;
  color: var(--text-primary);
  line-height: 1.4;
  text-align: center;
  font-style: italic;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (max-width: 768px) {
  .empty-state {
    padding: var(--spacing-2xl);
  }

  .empty-content {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .empty-state {
    padding: var(--spacing-lg);
  }

  .instructions-list {
    gap: var(--spacing-xs);
    padding: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .examples-carousel {
    padding: var(--spacing-md);
  }
}
</style>
