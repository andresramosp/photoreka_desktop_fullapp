<template>
  <div class="tpl-setup">
    <!-- Header — icon beside the text, not above it: the form below is long
         enough that the dialog can't spend three rows introducing itself. -->
    <div class="slide-header tpl-setup-header">
      <div v-if="template.modal?.icon" class="tpl-setup-icon">
        <n-icon :size="25" color="var(--primary-color)">
          <component :is="template.modal.icon" />
        </n-icon>
      </div>
      <div class="tpl-setup-heading">
        <h3 class="slide-title">{{ template.setup.title }}</h3>
        <p class="slide-desc">{{ template.setup.description }}</p>
      </div>
    </div>

    <div class="slide-body tpl-setup-body">
      <!-- One card per section. Ungrouped fields render bare, so a template
           that declares no sections looks exactly as it did before. -->
      <component
        :is="group.section ? 'section' : 'div'"
        v-for="group in fieldGroups"
        :key="group.id"
        :class="group.section ? 'tpl-section' : 'tpl-section-plain'"
      >
        <h4 v-if="group.section?.title" class="tpl-section-title">
          {{ group.section.title }}
        </h4>

        <div
          v-for="field in group.fields"
          :key="field.key"
          class="filter-field"
        >
          <label class="filter-label">
            {{ field.label }}
            <span v-if="field.required" style="color: var(--error-color)"
              >*</span
            >
            <span
              v-else-if="field.type !== 'intelligenceMode'"
              style="color: var(--text-tertiary); font-weight: 400"
            >
              (optional)
            </span>
          </label>

          <!-- text -->
          <n-input
            v-if="field.type === 'text'"
            :value="values[field.key] ?? ''"
            :placeholder="field.placeholder"
            :maxlength="field.maxlength"
            show-count
            @update:value="(v) => update(field.key, v)"
          />

          <!-- textarea -->
          <n-input
            v-else-if="field.type === 'textarea'"
            type="textarea"
            :value="values[field.key] ?? ''"
            :placeholder="field.placeholder"
            :maxlength="field.maxlength"
            :autosize="{
              minRows: field.minRows ?? 3,
              maxRows: field.maxRows ?? 6,
            }"
            show-count
            @update:value="(v) => update(field.key, v)"
          />

          <!-- slider -->
          <div v-else-if="field.type === 'slider'" class="target-size-control">
            <n-slider
              :value="values[field.key]"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              :marks="field.marks"
              :tooltip="false"
              @update:value="(v) => update(field.key, v)"
            />
            <div class="target-size-display">
              <span class="size-value">{{ values[field.key] }}</span>
              <span class="size-label">{{ field.unit }}</span>
            </div>
          </div>

          <!-- collections: the session's search scope -->
          <n-select
            v-else-if="field.type === 'collections'"
            v-model:show="collectionsDropdownShow"
            multiple
            filterable
            clearable
            :loading="collectionsStore.isLoading"
            :placeholder="field.placeholder ?? 'All collections'"
            :value="values[field.key] ?? []"
            :options="collectionOptions"
            :max-tag-count="3"
            @update:value="(v) => updateCollections(field.key, v)"
          />

          <!-- intelligence mode: side by side, so the three read as a choice
               between peers rather than a stack of three more form rows. -->
          <div v-else-if="field.type === 'intelligenceMode'" class="mode-grid">
            <div v-if="chatStore.isLoadingModes" class="mode-loading">
              <SpiralGridLoader variant="primary" :size="20" />
              <span>Loading modes…</span>
            </div>
            <div
              v-for="mode in chatStore.chatModes"
              v-else
              :key="mode.id"
              class="mode-option"
              :class="{ selected: values[field.key] === mode.id }"
              @click="update(field.key, mode.id)"
            >
              <span class="mode-option-label">
                <n-radio :checked="values[field.key] === mode.id" />
                <span class="mode-option-name">{{ mode.name }}</span>
                <n-tag
                  v-if="mode.costFactor != null"
                  size="tiny"
                  :bordered="false"
                  :type="costTone(mode.costFactor)"
                >
                  ×{{ mode.costFactor }}
                </n-tag>
              </span>
              <span class="mode-option-desc">
                {{ field.notes?.[mode.id] ?? mode.description }}
              </span>
            </div>
          </div>

          <span v-if="field.help" class="field-help">{{ field.help }}</span>
        </div>
      </component>
    </div>

    <!-- Footer — notice + actions, same layout as the wizard footer -->
    <div class="tpl-setup-footer">
      <!-- The scope can't hold what was asked of it. Takes the notice slot: it is
           the one thing standing between the user and a session that cannot work. -->
      <div v-if="scopeShortfall" class="footer-notice error">
        <n-icon :size="15"><AlertCircleOutline /></n-icon>
        <div class="footer-notice-text">
          <span>
            The collections you picked hold
            {{ scopeShortfall.available }} analyzed
            {{ scopeShortfall.available === 1 ? "photo" : "photos" }}, fewer
            than the {{ scopeShortfall.needed }} you asked the portfolio to
            reach. Either add collections to the scope or lower the portfolio
            size.
          </span>
        </div>
      </div>
      <div v-else-if="template.setup.notice" class="footer-notice info">
        <n-icon :size="15"><InformationCircleOutline /></n-icon>
        <div class="footer-notice-text">
          <span>{{ template.setup.notice }}</span>
        </div>
      </div>
      <div class="footer-actions">
        <n-button quaternary :disabled="submitting" @click="emit('cancel')">
          Cancel
        </n-button>
        <div class="footer-spacer" />
        <n-button
          type="primary"
          :disabled="!isComplete || !!scopeShortfall || isCheckingScope"
          :loading="submitting"
          @click="emit('submit')"
        >
          <template #icon>
            <n-icon><SparklesOutline /></n-icon>
          </template>
          {{ template.setup.submitLabel }}
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import {
  NInput,
  NSlider,
  NButton,
  NIcon,
  NRadio,
  NSelect,
  NTag,
} from "naive-ui";
import {
  AlertCircleOutline,
  InformationCircleOutline,
  SparklesOutline,
} from "@vicons/ionicons5";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import { useChatStore } from "@/stores/chat.js";
import { useCollectionsStore } from "@/stores/collections";
import { usePhotosStore } from "@/stores/photos";

defineOptions({ name: "ChatTemplateSetupForm" });

const props = defineProps({
  template: { type: Object, required: true },
  /** The answers object, owned by the host. */
  values: { type: Object, required: true },
  submitting: { type: Boolean, default: false },
});

const emit = defineEmits(["update:values", "submit", "cancel"]);

const chatStore = useChatStore();
const collectionsStore = useCollectionsStore();
const photosStore = usePhotosStore();

const update = (key, value) => {
  emit("update:values", { ...props.values, [key]: value });
};

/**
 * Fields laid out as the template's sections declare, section order first and
 * field order within it. Anything a field doesn't assign — or every field, for a
 * template with no `sections` at all — lands in one trailing group with no card.
 */
const fieldGroups = computed(() => {
  const fields = props.template.setup.fields ?? [];
  const groups = (props.template.setup.sections ?? [])
    .map((section) => ({
      id: section.id,
      section,
      fields: fields.filter((f) => f.section === section.id),
    }))
    .filter((group) => group.fields.length > 0);

  const known = new Set(groups.map((g) => g.id));
  const loose = fields.filter((f) => !f.section || !known.has(f.section));
  if (loose.length > 0)
    groups.push({ id: "__loose", section: null, fields: loose });

  return groups;
});

const isComplete = computed(() =>
  props.template.setup.fields.every((field) => {
    if (!field.required) return true;
    const value = props.values[field.key];
    return typeof value === "string" ? value.trim().length > 0 : value != null;
  }),
);

// ── Collections scope ───────────────────────────────────────────────────────

const collectionsDropdownShow = ref(false);
/** Up while the collections and the catalog load — submit waits for the verdict. */
const isCheckingScope = ref(false);

const collectionsField = computed(
  () =>
    props.template.setup.fields.find((f) => f.type === "collections") ?? null,
);

onMounted(async () => {
  if (!collectionsField.value) return;
  isCheckingScope.value = true;
  try {
    // The catalog is what turns collection membership into a POOL: a collection
    // lists photo ids, and only the fully analyzed ones can ever come back from a
    // search. Counting raw membership would promise photos the session can't show.
    await Promise.all([
      collectionsStore.getOrFetch(),
      photosStore.getOrFetch(),
    ]);
  } catch (error) {
    // Leaves the check unarmed rather than the form unusable: the session still
    // runs, it just starts without the warning the store couldn't back up.
    console.error("[ChatTemplateSetupForm] scope pool unavailable:", error);
  } finally {
    isCheckingScope.value = false;
  }
});

const collectionOptions = computed(() =>
  collectionsStore.allCollections.map((c) => ({
    label: c.name || c.title || `Collection ${c.id}`,
    value: c.id,
  })),
);

/** Closing on pick matches the wizard — the list is long and one pick is the norm. */
const updateCollections = (key, value) => {
  collectionsDropdownShow.value = false;
  update(key, Array.isArray(value) ? value : []);
};

const analyzedPhotoIds = computed(
  () => new Set(photosStore.processedPhotos.map((p) => String(p.id))),
);

/**
 * Whether the catalog is actually in memory. `getOrFetch` returns immediately when
 * another view already has a fetch in flight, so "no photos yet" is ambiguous —
 * and reading it as an empty pool would fire the warning at someone whose
 * collections are full.
 */
const poolReady = computed(
  () => !photosStore.isLoading && photosStore.allPhotos.length > 0,
);

/** Analyzed photos the pinned collections actually contain, counted once across all of them. */
const scopePhotoCount = computed(() => {
  const selected = props.values[collectionsField.value?.key] ?? [];
  if (selected.length === 0) return null;
  const pool = new Set();
  for (const id of selected) {
    const collection = collectionsStore.allCollections.find((c) => c.id === id);
    for (const photo of collection?.photos ?? []) {
      if (analyzedPhotoIds.value.has(String(photo.id)))
        pool.add(String(photo.id));
    }
  }
  return pool.size;
});

/**
 * The pin cannot hold what another field asked for — a portfolio of 20 out of a
 * pool of 12. Blocks the session instead of letting the assistant discover it a
 * paid round at a time, and it is a hard block: the numbers come from the user's
 * own two answers, so there is nothing here for them to disagree with.
 *
 * Silent while the catalog isn't in memory (the count would undercount) and when
 * nothing is pinned at all, which is the whole catalog.
 */
const scopeShortfall = computed(() => {
  const field = collectionsField.value;
  if (!field?.atLeast || isCheckingScope.value || !poolReady.value) return null;
  const available = scopePhotoCount.value;
  const needed = props.values[field.atLeast];
  if (available === null || typeof needed !== "number") return null;
  return available < needed ? { available, needed } : null;
});

/** Cheap modes read as neutral, the expensive one has to look expensive. */
const costTone = (factor) => {
  if (factor >= 4) return "warning";
  if (factor <= 0.5) return "success";
  return "default";
};
</script>

<style scoped>
.tpl-setup {
  display: flex;
  flex-direction: column;
  width: min(660px, 92vw);
  max-height: min(760px, 88vh);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-card, var(--bg-surface));
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────── */
.tpl-setup-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  text-align: left;
  gap: 14px;
  padding: 18px 28px 14px;
  margin-bottom: 0;
  border-bottom: 1px solid var(--border-color);
}

.tpl-setup-icon {
  display: inline-flex;
  flex-shrink: 0;
  padding: 10px;
  border-radius: var(--radius-md);
  background: var(--primary-08);
  border: 1px solid var(--primary-15);
}

.tpl-setup-heading {
  min-width: 0;
}

.slide-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.slide-desc {
  margin: 3px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* ── Body ───────────────────────────────────────────────── */
.tpl-setup-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 28px 4px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

/* ── Sections ───────────────────────────────────────────── */
/* Tinted with the text colour rather than a fixed surface token: --bg-card and
   --bg-surface are the same white in the light theme, so a token would leave the
   cards invisible there. */
.tpl-section,
.tpl-section-plain {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tpl-section {
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
}

.tpl-section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-tertiary);
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.field-help {
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-tertiary);
}

/* ── Slider (mirrors the wizard's size step) ────────────── */
.target-size-control {
  display: flex;
  align-items: center;
  gap: 24px;
}

.target-size-control :deep(.n-slider) {
  flex: 1;
}

.target-size-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 66px;
}

.size-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.size-label {
  font-size: 10px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

/* ── Intelligence mode ──────────────────────────────────── */
/* A row of peers. auto-fit keeps it honest if the backend ever returns more
   modes than the three the row was measured for. */
.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  align-items: stretch;
}

.mode-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  grid-column: 1 / -1;
}

.mode-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.15s;
}

.mode-option:hover {
  border-color: var(--text-tertiary);
}

.mode-option.selected {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}

.mode-option-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.mode-option-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The radio is a marker here, not a hit target of its own — the whole card is. */
.mode-option-label :deep(.n-radio) {
  flex-shrink: 0;
  margin-right: -2px;
  pointer-events: none;
}

.mode-option-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* ── Footer ─────────────────────────────────────────────── */
.tpl-setup-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 28px 18px;
  margin-top: 12px;
  border-top: 1px solid var(--border-color);
}

.footer-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  overflow: hidden;
  background: color-mix(in srgb, var(--info-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--info-color) 20%, transparent);
}

.footer-notice .n-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--info-color);
}

.footer-notice.error {
  background: color-mix(in srgb, var(--error-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--error-color) 20%, transparent);
}

.footer-notice.error .n-icon {
  color: var(--error-color);
}

.footer-notice-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-spacer {
  flex: 1;
}

/* ── Scrollbar ──────────────────────────────────────────── */
.tpl-setup-body::-webkit-scrollbar {
  width: 6px;
}

.tpl-setup-body::-webkit-scrollbar-track {
  background: transparent;
}

.tpl-setup-body::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.tpl-setup-body::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

@media (max-width: 640px) {
  .tpl-setup-header,
  .tpl-setup-body,
  .tpl-setup-footer {
    padding-left: 16px;
    padding-right: 16px;
  }

  .target-size-control {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .target-size-display {
    flex-direction: row;
    justify-content: center;
    gap: 6px;
  }
}
</style>
