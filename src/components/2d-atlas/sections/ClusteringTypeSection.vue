<template>
  <div class="section-content">
    <div class="control-item-full">
      <n-select
        :disabled="showDiscreteLoader"
        :value="selectedChunk"
        @update:value="handleChunkChange"
        :options="chunkOptions"
        :render-label="renderCriteriaLabel"
        size="small"
        class="embedding-select"
        placeholder="Select embedding type"
        @click.stop
        :filterable="false"
      />
    </div>

    <!-- Chunk description -->
    <span v-if="currentChunkDescription" class="chunk-description">
      {{ currentChunkDescription }}
    </span>

    <EmbeddingInfoModal v-model="showEmbeddingInfoModal" />
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { NSelect } from "naive-ui";
import EmbeddingInfoModal from "@/components/2d-atlas/EmbeddingInfoModal.vue";
import { renderCriteriaLabel } from "@/config/searchCriteria";

const props = defineProps({
  selectedChunk: {
    type: [String, Number],
    default: null,
  },
  chunkOptions: {
    type: Array,
    default: () => [],
  },
  showDiscreteLoader: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:selectedChunk", "chunk-change"]);

const showEmbeddingInfoModal = ref(false);

// Chunk descriptions
const chunkDescriptions = {
  general: "Visual, stylistic, and overall similarity clusters",
  story: "Storytelling themes and narrative clusters",
  context: "Contextual themes and regional clusters",
};

const currentChunkDescription = computed(() => {
  return chunkDescriptions[props.selectedChunk] || null;
});

const handleChunkChange = (value) => {
  emit("update:selectedChunk", value);
  emit("chunk-change", value);
};

// Expose method to open info modal (for parent to call)
defineExpose({
  openInfoModal: () => {
    showEmbeddingInfoModal.value = true;
  },
});
</script>

<style scoped>
.section-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-item-full {
  margin-bottom: 0;
}

.embedding-select {
  width: 100%;
}

.chunk-description {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
  display: block;
  margin-top: 0px;
}
</style>
