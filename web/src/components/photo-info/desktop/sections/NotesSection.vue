<template>
  <div class="notes-section">
    <p class="notes-subtitle">
      Add your thoughts, memories or context about this photo. Photoreka turns
      them into personal tags, so it becomes something you can search by.
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
          :type="isRemoval ? 'warning' : 'primary'"
          @click="emit('save-notes')"
          :loading="isSavingNotes"
          :disabled="wordCount > 50 || (isRemoval && !hasSavedNote)"
        >
          {{ buttonLabel }}
        </n-button>
      </div>
    </div>

    <!-- Los tags salen en la sección Tags, que puede estar fuera de pantalla:
         el aviso va aquí, donde el usuario acaba de pulsar. -->
    <p v-if="isGeneratingNoteTags" class="notes-pending">
      <n-spin :size="12" />
      <span>Deriving personal tags from your note…</span>
    </p>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NButton, NInput, NSpin } from "naive-ui";

defineOptions({ name: "PhotoInfoNotesSection" });

const props = defineProps({
  selectedPhoto: { type: Object, default: null },
  photoNotes: { type: String, default: "" },
  wordCount: { type: Number, default: 0 },
  isSavingNotes: { type: Boolean, default: false },
  /** Hay una nota en BD, que no es lo mismo que haber texto en el campo. */
  hasSavedNote: { type: Boolean, default: false },
  isGeneratingNoteTags: { type: Boolean, default: false },
});

// Vaciar el campo y guardar es la única forma de borrar una nota, así que el
// botón lo dice: quien vacía sin querer ve "Remove" antes de pulsar, no después.
const isRemoval = computed(() => props.photoNotes.trim().length === 0);

const buttonLabel = computed(() => {
  if (isRemoval.value) return "Remove Notes";
  return props.hasSavedNote ? "Update Notes" : "Save Notes";
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

.notes-pending {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.error-text {
  font-size: 12px;
  color: var(--error-color);
  font-weight: 500;
}
</style>
