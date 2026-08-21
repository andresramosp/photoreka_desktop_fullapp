<template>
  <div class="notes-section">
    <p class="notes-subtitle">
      Add your thoughts, memories or context about this photo. Your notes will
      be used for searches.
    </p>

    <n-input
      :value="photoNotes"
      @update:value="emit('update:photo-notes', $event)"
      type="textarea"
      placeholder="Example: Taken during our summer vacation in Barcelona. The lighting was amazing that evening..."
      :autosize="{ minRows: 4, maxRows: 10 }"
      @input="emit('update-word-count')"
    />

    <div class="notes-actions">
      <div
        class="word-counter"
        :class="{ 'word-limit-exceeded': wordCount > 50 }"
      >
        {{ wordCount }} / 50 words
      </div>
      <div class="notes-buttons-group">
        <span v-if="wordCount > 50" class="error-text">
          Please reduce to 50 words or less
        </span>
        <n-button
          size="small"
          type="primary"
          @click="emit('save-notes')"
          :loading="isSavingNotes"
          :disabled="wordCount > 50"
        >
          {{ selectedPhoto?.descriptions?.notes ? "Update Notes" : "Save Notes" }}
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { NButton, NInput } from "naive-ui";

defineOptions({ name: "PhotoInfoNotesSection" });

defineProps({
  selectedPhoto: { type: Object, default: null },
  photoNotes: { type: String, default: "" },
  wordCount: { type: Number, default: 0 },
  isSavingNotes: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:photo-notes",
  "update-word-count",
  "save-notes",
]);
</script>

<style scoped>
.notes-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.notes-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.notes-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.notes-buttons-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.word-counter {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
  transition: color 0.2s ease;
}

.word-counter.word-limit-exceeded {
  color: var(--error-color);
  font-weight: 600;
}

.error-text {
  font-size: 12px;
  color: var(--error-color);
  font-weight: 500;
}
</style>
