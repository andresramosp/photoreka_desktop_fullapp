<template>
  <div class="custom-weights-content" :class="{ compact }">
    <!-- Presets toolbar (hidden in compact/readonly mode) -->
    <div v-if="!compact && !readonly" class="presets-toolbar">
      <span class="presets-toolbar-label">Presets</span>

      <!-- Inline name form (save new or rename) -->
      <template v-if="namingMode">
        <n-input
          ref="presetInputRef"
          v-model:value="newPresetName"
          class="preset-inline-input"
          :placeholder="
            namingMode === 'rename' ? 'New name…' : 'Name this preset…'
          "
          size="small"
          :maxlength="80"
          @keyup.enter="confirmNaming"
          @keyup.esc="cancelNaming"
        />
        <n-button
          size="small"
          type="primary"
          :loading="saving"
          :disabled="!newPresetName.trim()"
          @click="confirmNaming"
        >
          <template #icon
            ><n-icon><Checkmark12Regular /></n-icon
          ></template>
        </n-button>
        <n-button size="small" quaternary @click="cancelNaming">
          <template #icon
            ><n-icon><Dismiss12Regular /></n-icon
          ></template>
        </n-button>
      </template>

      <!-- Select + actions -->
      <template v-else>
        <n-select
          v-model:value="activePresetId"
          class="preset-select"
          size="small"
          :options="presetOptions"
          placeholder="Load a preset…"
          clearable
          @update:value="onSelectPreset"
        />
        <template v-if="activePresetId">
          <n-button
            size="small"
            quaternary
            title="Rename preset"
            @click="startNaming('rename')"
          >
            <template #icon
              ><n-icon><Rename16Regular /></n-icon
            ></template>
          </n-button>
          <n-button
            size="small"
            quaternary
            title="Delete preset"
            @click="deletePreset(activePresetId)"
          >
            <template #icon
              ><n-icon><Delete16Regular /></n-icon
            ></template>
          </n-button>
        </template>
        <n-button
          size="small"
          secondary
          :type="activePresetId ? 'warning' : 'info'"
          :disabled="!activePresetId && presets.length >= 20"
          :loading="updatingWeights"
          :title="
            !activePresetId && presets.length >= 20
              ? 'Preset limit reached (20)'
              : activePresetId
                ? 'Overwrite preset with current weights'
                : 'Save current weights as new preset'
          "
          class="preset-save-trigger"
          @click="activePresetId ? updatePresetWeights() : startNaming('save')"
        >
          {{ activePresetId ? "Update" : "Save current" }}
        </n-button>
      </template>
    </div>

    <!-- Weight sliders -->
    <div class="weights-container">
      <div
        v-for="group in groupedCriteria"
        :key="group.key"
        class="criteria-group"
      >
        <div class="group-header">
          <h4 class="group-title" :style="{ color: group.color }">
            {{ group.label }}
          </h4>
        </div>
        <div class="weights-grid">
          <div
            v-for="criterion in group.criteria"
            :key="criterion.value"
            class="weight-item"
          >
            <ClickableWeightSlider
              :model-value="modelValue[criterion.value] || 0"
              @update:model-value="
                (value) => updateWeight(criterion.value, value)
              "
              :min="0"
              :max="1"
              :step="0.1"
              :label="criterion.label"
              :value-display="modelValue[criterion.value]?.toFixed(1) || '0.0'"
              :readonly="readonly"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, watch } from "vue";
import ClickableWeightSlider from "./wrappers/ClickableWeightSlider.vue";
import { useArtisticScores } from "@/composables/useArtisticScores";
import { useUserStore } from "@/stores/userStore";
import { api } from "@/utils/axios";
import { NSelect, NInput, NButton, NIcon, useMessage } from "naive-ui";
import {
  Dismiss12Regular,
  Checkmark12Regular,
  Rename16Regular,
  Delete16Regular,
} from "@vicons/fluent";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  formatCriterionName: {
    type: Function,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  selectedPresetId: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(["update:modelValue", "update:selectedPresetId"]);

const message = useMessage();

// Get artisticScores from composable
const { artisticScores } = useArtisticScores({
  profile: () => useUserStore().user?.profiles,
});

// Group criteria by their categories
const groupedCriteria = computed(() => {
  const groups = [];
  Object.entries(artisticScores).forEach(([groupKey, groupData]) => {
    groups.push({
      key: groupKey,
      label: groupData.label,
      criteria: groupData.criteria,
      color: groupData.color,
    });
  });
  return groups;
});

const updateWeight = (criterion, value) => {
  const newWeights = { ...props.modelValue };
  newWeights[criterion] = value;
  emit("update:modelValue", newWeights);
};

// ---- Preset management ----
const presets = ref([]);
const newPresetName = ref("");
const saving = ref(false);
const updatingWeights = ref(false);
const deletingId = ref(null);
const activePresetId = ref(null);
const namingMode = ref(null); // 'save' | 'rename' | null
const presetInputRef = ref(null);

const presetOptions = computed(() =>
  presets.value.map((p) => ({ label: p.name, value: p.id })),
);

watch(
  () => props.selectedPresetId,
  (id) => {
    activePresetId.value = id ?? null;
  },
  { immediate: true },
);

const onSelectPreset = (id) => {
  if (!id) {
    activePresetId.value = null;
    emit("update:selectedPresetId", null);
    return;
  }
  const preset = presets.value.find((p) => p.id === id);
  if (preset) {
    emit("update:modelValue", { ...preset.weights });
    activePresetId.value = id;
    emit("update:selectedPresetId", id);
  }
};

const startNaming = async (mode) => {
  if (mode === "rename") {
    const preset = presets.value.find((p) => p.id === activePresetId.value);
    newPresetName.value = preset?.name ?? "";
  } else {
    newPresetName.value = "";
  }
  namingMode.value = mode;
  await nextTick();
  presetInputRef.value?.focus();
};

const cancelNaming = () => {
  namingMode.value = null;
  newPresetName.value = "";
};

const confirmNaming = () => {
  if (namingMode.value === "save") savePreset();
  else if (namingMode.value === "rename") renamePreset();
};

onMounted(async () => {
  if (props.compact || props.readonly) return;
  try {
    const { data } = await api.get("/api/user/weight-presets");
    presets.value = data.presets;
    if (
      activePresetId.value &&
      !presets.value.some((preset) => preset.id === activePresetId.value)
    ) {
      activePresetId.value = null;
      emit("update:selectedPresetId", null);
    }
  } catch {
    // silently ignore — presets are non-critical
  }
});

const savePreset = async () => {
  const name = newPresetName.value.trim();
  if (!name) return;
  saving.value = true;
  try {
    const { data } = await api.post("/api/user/weight-presets", {
      name,
      weights: { ...props.modelValue },
    });
    presets.value = [...presets.value, data.preset];
    activePresetId.value = data.preset.id;
    emit("update:selectedPresetId", data.preset.id);
    cancelNaming();
    message.success(`Preset "${name}" saved`);
  } catch (err) {
    message.error(err?.response?.data?.message ?? "Failed to save preset");
  } finally {
    saving.value = false;
  }
};

const renamePreset = async () => {
  const name = newPresetName.value.trim();
  if (!name || !activePresetId.value) return;
  saving.value = true;
  try {
    const { data } = await api.patch(
      `/api/user/weight-presets/${activePresetId.value}`,
      { name },
    );
    presets.value = presets.value.map((p) =>
      p.id === data.preset.id ? data.preset : p,
    );
    cancelNaming();
    message.success(`Renamed to "${name}"`);
  } catch (err) {
    message.error(err?.response?.data?.message ?? "Failed to rename preset");
  } finally {
    saving.value = false;
  }
};

const updatePresetWeights = async () => {
  if (!activePresetId.value) return;
  updatingWeights.value = true;
  try {
    const { data } = await api.patch(
      `/api/user/weight-presets/${activePresetId.value}`,
      { weights: { ...props.modelValue } },
    );
    presets.value = presets.value.map((p) =>
      p.id === data.preset.id ? data.preset : p,
    );
    message.success("Preset updated");
  } catch (err) {
    message.error(err?.response?.data?.message ?? "Failed to update preset");
  } finally {
    updatingWeights.value = false;
  }
};

const deletePreset = async (id) => {
  deletingId.value = id;
  try {
    await api.delete(`/api/user/weight-presets/${id}`);
    presets.value = presets.value.filter((p) => p.id !== id);
    if (activePresetId.value === id) {
      activePresetId.value = null;
      emit("update:selectedPresetId", null);
    }
  } catch {
    message.error("Failed to delete preset");
  } finally {
    deletingId.value = null;
  }
};
</script>

<style scoped>
.custom-weights-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---- Presets toolbar ---- */
.presets-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.presets-toolbar-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #555564;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Preset select */
.preset-select {
  flex: 1;
  min-width: 0;
}

/* Save / Update trigger */
.preset-save-trigger {
  flex-shrink: 0;
}

/* Inline add form */
.preset-inline-input {
  flex: 1;
  min-width: 0;
}

/* ---- Sliders ---- */
.weights-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}

.criteria-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-header {
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}

.group-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.weights-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weight-item {
  display: flex;
  flex-direction: column;
}

/* Scrollbar styling */
.weights-container::-webkit-scrollbar {
  width: 6px;
}

.weights-container::-webkit-scrollbar-track {
  background: var(--bg-body);
  border-radius: 3px;
}

.weights-container::-webkit-scrollbar-thumb {
  background: var(--border-color-hover);
  border-radius: 3px;
}

.weights-container::-webkit-scrollbar-thumb:hover {
  background: #3c3c42;
}

/* Compact mode: 2-column grid, no inner scroll */
.compact .weights-container {
  max-height: none;
  overflow-y: visible;
  padding-right: 0;
}

.compact .weights-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.compact .weights-grid .weight-item :deep(.clickable-weight-slider) {
  margin-bottom: 0;
}

.compact .weights-grid .weight-item :deep(.slider-track) {
  height: 38px;
}

.compact .weights-grid .weight-item :deep(.slider-label) {
  font-size: 12px;
}

/* Responsive */
@media (max-width: 768px) {
  .criteria-group {
    gap: 6px;
  }

  .group-title {
    font-size: 11px;
  }
}
</style>
