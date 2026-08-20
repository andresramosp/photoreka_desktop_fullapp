<template>
  <div class="notes-section">
    <!-- Modo lectura: solo aparece si ya hay nota guardada y no se esta editando -->
    <div v-if="!isEditing" class="notes-read">
      <p v-if="savedNotes" class="notes-text">{{ savedNotes }}</p>
      <p v-else class="notes-placeholder">
        No notes yet. Add your thoughts, memories or context about this photo —
        they are used for searches.
      </p>
      <n-button
        size="tiny"
        quaternary
        class="notes-edit-btn"
        :title="savedNotes ? 'Edit notes' : 'Add notes'"
        @click="startEditing"
      >
        <template #icon>
          <n-icon size="16"><EditIcon /></n-icon>
        </template>
      </n-button>
    </div>

    <!-- Modo edicion -->
    <div v-else class="notes-edit">
      <n-input
        ref="inputRef"
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
          <n-button size="small" quaternary @click="cancelEditing">
            Cancel
          </n-button>
          <n-button
            size="small"
            type="primary"
            @click="emit('save-notes')"
            :loading="isSavingNotes"
            :disabled="wordCount > 50"
          >
            {{ savedNotes ? "Update" : "Save" }}
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { NButton, NIcon, NInput } from "naive-ui";
import { CreateOutline as EditIcon } from "@vicons/ionicons5";

defineOptions({ name: "PhotoInfoNotesSection" });

const props = defineProps({
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

const isEditing = ref(false);
const inputRef = ref(null);

const savedNotes = computed(() => props.selectedPhoto?.descriptions?.notes || "");

const startEditing = async () => {
  isEditing.value = true;
  await nextTick();
  inputRef.value?.focus();
};

const cancelEditing = () => {
  // Devuelve el borrador al ultimo valor guardado para no arrastrar cambios
  // descartados a la siguiente foto.
  emit("update:photo-notes", savedNotes.value);
  emit("update-word-count");
  isEditing.value = false;
};

// Al terminar un guardado correcto se vuelve a lectura.
watch(
  () => props.isSavingNotes,
  (saving, wasSaving) => {
    if (wasSaving && !saving) isEditing.value = false;
  },
);

// Cambiar de foto siempre sale del modo edicion.
watch(
  () => props.selectedPhoto?.id,
  () => {
    isEditing.value = false;
  },
);
</script>

<style scoped>
.notes-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.notes-read {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
}

.notes-text {
  margin: 0;
  flex: 1;
  font-size: var(--font-size-sm);
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.notes-placeholder {
  margin: 0;
  flex: 1;
  font-size: var(--font-size-sm);
  line-height: 1.6;
  color: var(--text-tertiary);
}

.notes-edit-btn {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.notes-edit-btn:hover {
  color: var(--primary-color);
}

.notes-edit {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
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
