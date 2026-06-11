<template>
  <div class="report-section">
    <div class="report-section-header">
      <h2 class="section-title">
        <n-icon class="section-icon">
          <EyeIcon />
        </n-icon>
        Visual Aspects Analysis
      </h2>
      <p class="section-description">
        Distribution of visual characteristics across your photo collection
      </p>
    </div>

    <div class="visual-aspects-container">
      <div
        v-for="aspect in visualAspectsData"
        :key="aspect.key"
        class="aspect-group"
      >
        <AspectCard :aspect="aspect" />
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="visualAspectsData.length === 0" class="empty-aspects">
      <n-icon size="48" :component="EyeIcon" class="empty-icon" />
      <p class="empty-text">No visual aspects data found in your photos</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { getVisualAspectsOptions } from "@/stores/searchStore.js";
import { useUserStore } from "@/stores/userStore.ts";
import { EyeOutline as EyeIcon } from "@vicons/ionicons5";
import AspectCard from "@/components/report/AspectCard.vue";
import { buildVisualAspectsData } from "@/components/report/visualAspectsUtils.js";

const userStore = useUserStore();
const visualAspectsOptions = computed(() =>
  getVisualAspectsOptions(userStore.user?.profiles),
);

const props = defineProps({
  photos: {
    type: Array,
    required: true,
  },
});

const visualAspectsData = computed(() => {
  return buildVisualAspectsData(props.photos, visualAspectsOptions.value);
});
</script>

<style scoped>
/* Common styles inherited from parent */

/* Visual Aspects Container */
.visual-aspects-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-xl);
}

/* Empty State */
.empty-aspects {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4xl) var(--spacing-2xl);
  gap: var(--spacing-md);
}

/* Mobile Responsiveness */
@media (max-width: 1400px) {
  .visual-aspects-container {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 1024px) {
  .visual-aspects-container {
    grid-template-columns: 1fr;
  }
}
</style>
