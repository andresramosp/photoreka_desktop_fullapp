<template>
  <n-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    preset="dialog"
    :show-icon="false"
    :bordered="true"
    :closable="!isModeStep"
    :mask-closable="!isBuilding"
    :close-on-esc="!isBuilding"
    :class="['build-wizard-modal', { 'mode-step': isModeStep }]"
    :style="{ width: modalWidth }"
    @close="handleClose"
  >
    <!-- Building overlay -->
    <div v-if="isBuilding" class="building-overlay">
      <div class="building-content">
        <div class="build-grid-spinner" aria-label="Building portfolio">
          <span
            v-for="i in 9"
            :key="i"
            class="build-grid-cell"
            :style="{ '--cell-index': i - 1 }"
          />
        </div>
        <h3 class="building-title">Building your portfolio…</h3>
        <p class="building-subtitle">
          Our engine is evaluating and curating your best photos. <br />
          You can close this dialog. We well notify you when it's done!
        </p>
        <div class="building-steps">
          <div
            v-for="step in buildSteps"
            :key="step.key"
            class="build-step"
            :class="{ active: step.key === currentBuildStep, done: step.done }"
          >
            <n-icon :size="16">
              <CheckmarkCircleOutline v-if="step.done" />
              <EllipseOutline v-else />
            </n-icon>
            <span>{{ step.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Wizard stepped form -->
    <div v-else class="wizard-stepped">
      <!-- Step tabs -->
      <div v-if="currentStepKey !== 'mode'" class="wizard-tabs">
        <button
          v-for="(step, idx) in wizardSteps"
          :key="step.key"
          class="wizard-tab"
          :class="{
            active: idx === currentStep,
            completed: idx < currentStep,
          }"
          :disabled="idx > currentStep"
          @click="idx < currentStep && (currentStep = idx)"
        >
          <n-icon :component="step.icon" :size="20" class="tab-icon" />
          <span class="tab-label">{{ step.shortLabel }}</span>
        </button>
      </div>

      <!-- Slide container -->
      <div class="slide-container">
        <Transition :name="slideDirection" mode="out-in">
          <!-- Step 0: Build mode (AI vs Manual) -->
          <div
            v-if="currentStepKey === 'mode'"
            key="mode"
            class="slide mode-slide"
          >
            <div class="slide-header mode-header">
              <div class="mode-header-icon">
                <n-icon :size="22" color="var(--primary-color)">
                  <component :is="PortfolioIcon" />
                </n-icon>
              </div>
              <h3 class="slide-title">New Portfolio</h3>
              <p class="slide-desc">Choose how you want to build it.</p>
            </div>
            <div
              class="slide-body mode-grid"
              :class="{ 'mode-grid--three': showChatMode }"
            >
              <button
                type="button"
                class="mode-card surface-flat surface-flat--interactive"
                :class="{ 'is-selected': buildMode === 'ai' }"
                @click="selectMode('ai')"
              >
                <n-icon :size="18" class="mode-check"
                  ><CheckmarkCircleOutline
                /></n-icon>
                <div class="mode-card-icon">
                  <n-icon :size="26" color="var(--primary-color)"
                    ><SparklesOutline
                  /></n-icon>
                </div>
                <h4 class="mode-card-title">AI Powered</h4>
                <p class="mode-card-desc">
                  Guided wizard. Our engine evaluates your catalog and curates
                  the selection for you.
                </p>
                <n-tag
                  class="mode-card-tag"
                  size="small"
                  type="warning"
                  :bordered="false"
                >
                  <template #icon>
                    <n-icon><FlashOutline /></n-icon>
                  </template>
                  Uses credits
                </n-tag>
              </button>
              <button
                v-if="showChatMode"
                type="button"
                class="mode-card surface-flat surface-flat--interactive"
                :class="{ 'is-selected': buildMode === 'chat' }"
                @click="selectMode('chat')"
              >
                <n-icon :size="18" class="mode-check"
                  ><CheckmarkCircleOutline
                /></n-icon>
                <div class="mode-card-icon">
                  <n-icon :size="26" color="var(--accent-color)"
                    ><ChatbubblesOutline
                  /></n-icon>
                </div>
                <h4 class="mode-card-title">Chat Assisted</h4>
                <p class="mode-card-desc">
                  Curate in conversation. Describe the direction and keep what
                  earns its place.
                </p>
                <n-tag
                  class="mode-card-tag"
                  size="small"
                  type="warning"
                  :bordered="false"
                >
                  <template #icon>
                    <n-icon><FlashOutline /></n-icon>
                  </template>
                  Uses credits
                </n-tag>
              </button>
              <button
                type="button"
                class="mode-card surface-flat surface-flat--interactive"
                :class="{ 'is-selected': buildMode === 'manual' }"
                @click="selectMode('manual')"
              >
                <n-icon :size="18" class="mode-check"
                  ><CheckmarkCircleOutline
                /></n-icon>
                <div class="mode-card-icon">
                  <n-icon :size="26" color="var(--text-secondary)"
                    ><CreateOutline
                  /></n-icon>
                </div>
                <h4 class="mode-card-title">Manual</h4>
                <p class="mode-card-desc">
                  Start from an empty portfolio and pick every photo yourself.
                </p>
                <n-tag class="mode-card-tag" size="small" :bordered="false">
                  <template #icon>
                    <n-icon><CheckmarkOutline /></n-icon>
                  </template>
                  Free
                </n-tag>
              </button>
            </div>
          </div>

          <!-- Manual: Name & Description -->
          <div
            v-else-if="currentStepKey === 'details'"
            key="details"
            class="slide"
          >
            <div class="slide-header">
              <h3 class="slide-title">Name & Description</h3>
              <p class="slide-desc">
                Name your portfolio — you'll pick the photos yourself.
              </p>
            </div>
            <div class="slide-body">
              <div class="filter-field">
                <label class="filter-label"
                  >Portfolio name
                  <span style="color: var(--error-color)">*</span></label
                >
                <n-input
                  v-model:value="form.name"
                  placeholder="e.g. 'Urban Stories 2025' or 'Night Light Series'…"
                  :maxlength="200"
                  show-count
                />
              </div>
              <div class="filter-field">
                <label class="filter-label"
                  >Description
                  <span style="color: var(--text-tertiary); font-weight: 400"
                    >(optional)</span
                  ></label
                >
                <n-input
                  v-model:value="form.description"
                  type="textarea"
                  placeholder="Add a description…"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  :maxlength="500"
                  show-count
                />
              </div>
            </div>
          </div>

          <!-- Step 1: Name & Theme -->
          <div v-else-if="currentStepKey === 'name'" key="name" class="slide">
            <div class="slide-header">
              <h3 class="slide-title">Name & Theme</h3>
              <p class="slide-desc">
                Give your portfolio a name and optionally describe its theme.
              </p>
            </div>
            <div class="slide-body">
              <div class="filter-field">
                <label class="filter-label"
                  >Portfolio name
                  <span style="color: var(--error-color)">*</span></label
                >
                <n-input
                  v-model:value="form.name"
                  placeholder="e.g. 'Urban Stories 2025' or 'Night Light Series'…"
                  :maxlength="200"
                  show-count
                />
              </div>
              <div class="filter-field">
                <label class="filter-label"
                  >Theme & direction
                  <span style="color: var(--text-tertiary); font-weight: 400"
                    >(optional)</span
                  ></label
                >
                <n-input
                  v-model:value="form.themePreferences"
                  type="textarea"
                  placeholder="e.g. 'European cities at night, moody urban vibes' or 'nature macro photography, vibrant colors'…"
                  :autosize="{ minRows: 2, maxRows: 3 }"
                  :maxlength="200"
                  show-count
                />
              </div>
              <!-- The "soft bias" disclaimer lives in the footer (see
                   footerNotice) so this slide keeps its fixed height. -->
            </div>
          </div>

          <!-- Step 2: Portfolio Size -->
          <div v-else-if="currentStepKey === 'size'" key="size" class="slide">
            <div class="slide-header">
              <h3 class="slide-title">Portfolio Size</h3>
              <p class="slide-desc">
                How many photos should the final portfolio have?
              </p>
            </div>
            <div class="slide-body">
              <div class="target-size-control">
                <n-slider
                  v-model:value="form.targetSize"
                  :min="10"
                  :max="40"
                  :step="5"
                  :marks="{
                    10: '10',
                    15: '15',
                    20: '20',
                    25: '25',
                    30: '30',
                    35: '35',
                    40: '40',
                  }"
                  :tooltip="true"
                />
                <div class="target-size-display">
                  <span class="size-value">{{ form.targetSize }}</span>
                  <span class="size-label">photos</span>
                </div>
              </div>

              <!-- Eligibility errors are rendered in the footer (footerNotice). -->
            </div>
          </div>

          <!-- Step 3: Visual Filters -->
          <div
            v-else-if="currentStepKey === 'filters'"
            key="filters"
            class="slide"
          >
            <div class="slide-header">
              <h3 class="slide-title">Visual Filters</h3>
              <p class="slide-desc">
                Optionally narrow the pool by visual characteristics.
              </p>
            </div>
            <div class="slide-body">
              <n-tree-select
                v-model:value="selectedVisualAspects"
                multiple
                clearable
                placeholder="Any visual aspect…"
                :options="treeSelectOptions"
                :max-tag-count="3"
                check-strategy="child"
                :show-path="false"
                expand-on-click
              />
              <div class="filter-row">
                <div class="filter-field">
                  <label class="filter-label">From</label>
                  <n-date-picker
                    v-model:value="dateFrom"
                    type="date"
                    clearable
                    placeholder="Start date"
                    style="width: 100%"
                  />
                </div>
                <div class="filter-field">
                  <label class="filter-label">To</label>
                  <n-date-picker
                    v-model:value="dateTo"
                    type="date"
                    clearable
                    placeholder="End date"
                    style="width: 100%"
                  />
                </div>
              </div>
              <div class="filter-field">
                <label class="filter-label">Collections</label>
                <n-select
                  v-model:show="collectionsDropdownShow"
                  multiple
                  filterable
                  clearable
                  placeholder="All collections"
                  :value="selectedCollections"
                  :options="collectionOptions"
                  :max-tag-count="3"
                  @update:value="handleCollectionsUpdate"
                />
              </div>

              <!-- Eligibility errors are rendered in the footer (footerNotice). -->
            </div>
          </div>

          <!-- Step 4: Artistic Weights -->
          <div
            v-else-if="currentStepKey === 'weights'"
            key="weights"
            class="slide"
          >
            <div class="slide-header">
              <h3 class="slide-title">Artistic Weights</h3>
              <p class="slide-desc">
                Tell us what matters most by choosing a preset or tweaking the
                weights
              </p>
            </div>
            <div class="slide-body">
              <!-- Mode toggle: Manual / Describe -->
              <div class="weight-mode-toggle">
                <button
                  type="button"
                  class="weight-mode-option"
                  :class="{ active: form.weightMode === 'advanced' }"
                  @click="setWeightMode('advanced')"
                >
                  <n-icon :size="14"><BarChartOutline /></n-icon>
                  <span>Manual</span>
                </button>
                <button
                  type="button"
                  class="weight-mode-option"
                  :class="{ active: form.weightMode === 'describe' }"
                  @click="setWeightMode('describe')"
                >
                  <n-icon :size="14"><CreateOutline /></n-icon>
                  <span>Describe</span>
                </button>
              </div>

              <!-- Mode content (soft fade on switch) -->
              <Transition name="weight-mode" mode="out-in">
                <!-- Describe mode -->
                <div
                  v-if="form.weightMode === 'describe'"
                  key="describe"
                  class="weight-mode-content"
                >
                  <n-input
                    v-model:value="form.stylePreferences"
                    type="textarea"
                    placeholder="e.g. 'strong storytelling and humor' or 'cinematic, high-contrast, geometric compositions'…"
                    :autosize="{ minRows: 2, maxRows: 4 }"
                    :maxlength="1000"
                    clearable
                  />
                  <div class="style-preview-trigger">
                    <n-button
                      size="tiny"
                      :loading="isPreviewing"
                      :disabled="!form.stylePreferences.trim()"
                      @click="runStylePreview(form.stylePreferences)"
                      secondary
                      type="info"
                    >
                      <template #icon
                        ><n-icon><FlashOutline /></n-icon
                      ></template>
                      Preview weights
                    </n-button>
                  </div>
                  <CustomArtisticWeights
                    :model-value="previewWeights"
                    @update:model-value="() => {}"
                    :format-criterion-name="formatCriterionName"
                    compact
                    tabbed-groups
                    readonly
                  />
                </div>

                <!-- Advanced mode -->
                <div v-else key="manual" class="weight-mode-content">
                  <div class="preset-section">
                    <div class="preset-row">
                      <n-button
                        secondary
                        v-for="preset in genrePresetOptions"
                        :key="preset.value"
                        :type="
                          selectedGenre === preset.value ? 'primary' : 'default'
                        "
                        :ghost="selectedGenre !== preset.value"
                        size="small"
                        @click="applyPreset(preset.value)"
                        class="preset-button"
                      >
                        <template #icon>
                          <n-icon><component :is="preset.icon" /></n-icon>
                        </template>
                        {{ preset.label }}
                      </n-button>
                    </div>
                  </div>
                  <CustomArtisticWeights
                    :model-value="form.weights"
                    @update:model-value="onAdvancedWeightsChange"
                    :format-criterion-name="formatCriterionName"
                    compact
                    tabbed-groups
                    :readonly="selectedGenre !== 'custom'"
                  />
                </div>
              </Transition>
            </div>
          </div>

          <!-- Step 5: Coherence Mode -->
          <div
            v-else-if="currentStepKey === 'coherence'"
            key="coherence"
            class="slide"
          >
            <div class="slide-header">
              <h3 class="slide-title">Coherence Mode</h3>
              <p class="slide-desc">
                How should the AI ensure visual consistency?
              </p>
            </div>
            <div class="slide-body">
              <n-radio-group
                v-model:value="form.coherenceMode"
                class="coherence-group"
              >
                <div
                  class="coherence-option default"
                  :class="{
                    selected: form.coherenceMode === defaultCoherenceMode.value,
                  }"
                  @click="form.coherenceMode = defaultCoherenceMode.value"
                >
                  <n-radio :value="defaultCoherenceMode.value" />
                  <div class="coherence-option-text">
                    <span class="coherence-label"
                      >{{ defaultCoherenceMode.label }}
                      <n-tag size="tiny" :bordered="false">Default</n-tag>
                    </span>
                    <span class="coherence-desc">{{
                      defaultCoherenceMode.description
                    }}</span>
                  </div>
                </div>
                <div class="coherence-grid">
                  <div
                    v-for="mode in otherCoherenceModes"
                    :key="mode.value"
                    class="coherence-option"
                    :class="{ selected: form.coherenceMode === mode.value }"
                    @click="form.coherenceMode = mode.value"
                  >
                    <n-radio :value="mode.value" />
                    <div class="coherence-option-text">
                      <span class="coherence-label">{{ mode.label }}</span>
                      <span class="coherence-desc">{{ mode.description }}</span>
                    </div>
                  </div>
                </div>
              </n-radio-group>
            </div>
          </div>

          <!-- Step 6: Sequencing -->
          <div
            v-else-if="currentStepKey === 'sequencing'"
            key="sequencing"
            class="slide"
          >
            <div class="slide-header">
              <h3 class="slide-title">Sequencing</h3>
              <p class="slide-desc">
                Should the AI order photos in a meaningful narrative sequence?
              </p>
            </div>
            <div class="slide-body">
              <div class="sequencing-toggle">
                <n-switch v-model:value="form.sequencing" />
                <span class="sequencing-label">{{
                  form.sequencing ? "Enabled" : "Disabled"
                }}</span>
              </div>
              <n-input
                v-if="form.sequencing"
                v-model:value="form.sequencingPreferences"
                type="textarea"
                placeholder="e.g. 'Start wide, end intimate' or 'chronological journey through the city'…"
                :autosize="{ minRows: 2, maxRows: 4 }"
                :maxlength="2000"
                show-count
              />
            </div>
          </div>
        </Transition>
      </div>

      <!-- Sticky footer: step notice + credit estimate + navigation -->
      <div class="wizard-footer" :class="{ compact: !showCreditEstimate }">
        <!-- Step-scoped warnings/disclaimers: they live here instead of inside
             the slides, which have a fixed height and would hide them. -->
        <Transition name="hint-fade">
          <div
            v-if="footerNotice"
            class="footer-notice"
            :class="footerNotice.tone"
          >
            <n-icon :size="15"><InformationCircleOutline /></n-icon>
            <div class="footer-notice-text">
              <strong v-if="footerNotice.title">{{
                footerNotice.title
              }}</strong>
              <span>{{ footerNotice.text }}</span>
              <span v-if="footerNotice.hint" class="footer-notice-hint">{{
                footerNotice.hint
              }}</span>
            </div>
          </div>
        </Transition>
        <div v-if="showCreditEstimate" class="credit-estimate">
          <div class="credit-estimate-left">
            <n-icon :size="16" color="var(--warning-color)"
              ><FlashOutline
            /></n-icon>
            <span class="credit-estimate-text">Estimated cost:</span>
          </div>
          <span class="credit-estimate-value">
            {{ displayedCredits != null ? displayedCredits + " credits" : "…" }}
          </span>
        </div>
        <div class="footer-actions">
          <n-button
            v-if="currentStep > 0"
            @click="goBack"
            :disabled="isBuilding"
            quaternary
          >
            <template #icon>
              <n-icon><ChevronBack /></n-icon>
            </template>
            Back
          </n-button>
          <n-button
            v-if="currentStep === 0"
            @click="handleClose"
            :disabled="isBuilding"
            quaternary
          >
            Cancel
          </n-button>
          <div class="footer-spacer" />
          <span v-if="currentStepKey !== 'mode'" class="step-counter"
            >{{ currentStep + 1 }} / {{ wizardSteps.length }}</span
          >
          <n-button
            v-if="currentStepKey === 'mode' && buildMode === 'chat'"
            type="primary"
            @click="handleChatAssisted"
          >
            Continue
            <template #icon>
              <n-icon><ChevronForward /></n-icon>
            </template>
          </n-button>
          <n-button
            v-else-if="currentStepKey === 'details'"
            type="primary"
            @click="handleManualCreate"
            :disabled="form.name.trim().length === 0"
            :loading="isCreatingManual"
          >
            <template #icon>
              <n-icon><CreateOutline /></n-icon>
            </template>
            Create Portfolio
          </n-button>
          <n-button
            v-else-if="currentStep < wizardSteps.length - 1"
            type="primary"
            @click="goNext"
            :disabled="!canAdvance"
          >
            Next
            <template #icon>
              <n-icon><ChevronForward /></n-icon>
            </template>
          </n-button>
          <n-button
            v-else-if="currentStepKey !== 'mode'"
            type="primary"
            @click="handleSubmit"
            :disabled="!canSubmit"
            :loading="isBuilding"
          >
            <template #icon>
              <n-icon><FlashOutline /></n-icon>
            </template>
            Build Portfolio
          </n-button>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue";
import {
  NModal,
  NSlider,
  NButton,
  NIcon,
  NInput,
  NSwitch,
  NRadioGroup,
  NRadio,
  NTreeSelect,
  NSelect,
  NDatePicker,
  NTag,
  useMessage,
} from "naive-ui";
import {
  FlashOutline,
  CheckmarkCircleOutline,
  EllipseOutline,
  ChevronBackOutline as ChevronBack,
  ChevronForwardOutline as ChevronForward,
  ResizeOutline,
  BarChartOutline,
  FunnelOutline,
  LinkOutline,
  ColorPaletteOutline,
  ReorderThreeOutline,
  InformationCircleOutline,
  CreateOutline,
  SparklesOutline,
  CheckmarkOutline,
  WalkOutline,
  ChatbubblesOutline,
} from "@vicons/ionicons5";
import {
  BookOpen16Regular,
  Camera20Regular,
  Settings20Regular,
} from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";
import { TOOL_ICONS, getToolById } from "@/config/toolsConfig";
import CustomArtisticWeights from "@/components/CustomArtisticWeights.vue";
import { useArtisticScores } from "@/composables/useArtisticScores";
import { useUserStore } from "@/stores/userStore";
import { getVisualAspectsOptions } from "@/stores/searchStore";
import { getGenrePresetKeys, getProfileVariant } from "@/config/photo_schema";
import { useCollectionsStore } from "@/stores/collections";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";
import { usePhotosStore } from "@/stores/photos";

const props = defineProps({
  show: { type: Boolean, default: false },
  /** Pre-fill the wizard from an existing build config (used for variants). */
  prefillConfig: { type: Object, default: null },
  targetSetId: { type: [Number, String], default: null },
  /** Show the AI / Manual mode step as the first step of the wizard. */
  allowManual: { type: Boolean, default: true },
});
const emit = defineEmits([
  "update:show",
  "build-complete",
  "manual-created",
  "chat-assisted",
]);

const PortfolioIcon = TOOL_ICONS[getToolById("portfolios").icon];

const message = useMessage();
const collectionsStore = useCollectionsStore();
const portfolioStore = usePortfolioBuildsStore();
const photosStore = usePhotosStore();

const { genrePresets, formatCriterionName, artisticScores } = useArtisticScores(
  { profile: () => useUserStore().user?.profiles },
);

// ── Wizard navigation ───────────────────────────────────────
const currentStep = ref(0);
const slideDirection = ref("slide-left");

// 'ai' | 'manual' | 'chat'. Only meaningful when the mode step is shown;
// otherwise the wizard is always in AI mode (e.g. the variant wizard in the
// detail view).
const buildMode = ref("ai");

// The chat-assisted flow is curated entirely through the ✓ button on each photo
// card in the chat, which only exists on desktop — so it isn't offered on narrow
// screens rather than offered and then dead-ended.
const isNarrowViewport = ref(window.innerWidth < 768);
const onViewportResize = () => {
  isNarrowViewport.value = window.innerWidth < 768;
};
onMounted(() => window.addEventListener("resize", onViewportResize));
onUnmounted(() => window.removeEventListener("resize", onViewportResize));

const showChatMode = computed(() => !isNarrowViewport.value);

// Shrinking the window with "chat" selected would leave the step with no way
// forward, since its card — and its Continue button — are both gone.
watch(showChatMode, (available) => {
  if (!available && buildMode.value === "chat") buildMode.value = "ai";
});

const MODE_STEP = { key: "mode", shortLabel: "Mode", icon: SparklesOutline };
const MANUAL_STEPS = [
  { key: "details", shortLabel: "Details", icon: CreateOutline },
];
const AI_STEPS = [
  { key: "name", shortLabel: "Name", icon: CreateOutline },
  { key: "size", shortLabel: "Size", icon: ResizeOutline },
  { key: "filters", shortLabel: "Filters", icon: FunnelOutline },
  { key: "weights", shortLabel: "Weights", icon: BarChartOutline },
  { key: "coherence", shortLabel: "Coherence", icon: LinkOutline },
  // { key: "sequencing", shortLabel: "Sequence", icon: ReorderThreeOutline },
];

// The mode step is skipped for variants (a variant is always an AI build).
const showModeStep = computed(() => props.allowManual && !props.prefillConfig);

const wizardSteps = computed(() => {
  if (!showModeStep.value) return AI_STEPS;
  // Chat-assisted has no further steps here: its own setup form lives inside
  // the chat modal, which takes over as soon as the user confirms.
  if (buildMode.value === "chat") return [MODE_STEP];
  return [
    MODE_STEP,
    ...(buildMode.value === "manual" ? MANUAL_STEPS : AI_STEPS),
  ];
});

const currentStepKey = computed(
  () => wizardSteps.value[currentStep.value]?.key ?? "mode",
);

const isModeStep = computed(() => currentStepKey.value === "mode");

// The mode step is the only one that lays cards out side by side, so it's the
// only one that needs the extra width — three of them at 700px squeeze every
// description into five wrapped lines. Every other step keeps the width its
// fields were laid out for.
const modalWidth = computed(() =>
  isModeStep.value && showChatMode.value ? "880px" : "700px",
);

const showCreditEstimate = computed(
  () => buildMode.value !== "manual" && currentStepKey.value !== "mode",
);

const goNext = () => {
  if (currentStep.value < wizardSteps.value.length - 1) {
    slideDirection.value = "slide-left";
    currentStep.value++;
  }
};

// Selecting a mode only updates the choice — the user confirms with "Next".
const selectMode = (mode) => {
  buildMode.value = mode;
};

const goBack = () => {
  if (currentStep.value > 0) {
    slideDirection.value = "slide-right";
    currentStep.value--;
  }
};

// ── Form state ──────────────────────────────────────────────
// Emergency fallback: used only if the backend fetch hasn't completed yet
// (e.g. network failure or the user somehow reaches step 3 in < 1 RTT).
// The canonical defaults live in the backend — see
// GET /api/portfolio-build/default-weights.
const getFallbackWeights = () => {
  const w = {};
  Object.values(artisticScores).forEach((group) => {
    group.criteria.forEach((c) => {
      w[c.value] = 0.5;
    });
  });
  return w;
};

const form = reactive({
  name: "",
  description: "", // manual mode only
  targetSize: 20,
  weightMode: "advanced", // 'describe' | 'advanced'
  stylePreferences: "",
  weights: portfolioStore.defaultWeights
    ? { ...portfolioStore.defaultWeights }
    : getFallbackWeights(),
  coherenceMode: "free", // 'free' | 'visual' | 'chromatic' | 'narrative' | 'heterogeneous'
  themePreferences: "",
  sequencing: false,
  sequencingPreferences: "",
});

const selectedGenre = ref("general");
const selectedVisualAspects = ref([]);
const selectedCollections = ref([]);
const collectionsDropdownShow = ref(false);
const dateFrom = ref(null);
const dateTo = ref(null);

// ── Building state ─────────────────────────────────────────
const isBuilding = ref(false);
const currentBuildStep = ref("");
const buildProgressDetail = ref({
  recallSize: null,
  evaluationProgress: null,
  refinementProgress: null,
});
let pollTimer = null;

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

const buildSteps = computed(() => {
  const detail = buildProgressDetail.value;

  const recallLabel = (() => {
    if (detail.recallSize != null) {
      return `Selecting candidate pool — ${detail.recallSize} candidates`;
    }
    return "Selecting candidate pool";
  })();

  const evaluatingLabel = (() => {
    const ep = detail.evaluationProgress;
    if (ep && typeof ep.total === "number" && ep.total > 0) {
      return `Evaluating photos - ${ep.total} batches`;

      // return `Evaluating batches — ${ep.completed}/${ep.total}`;
    }
    return "Evaluating batches";
  })();

  const refiningLabel = (() => {
    const rp = detail.refinementProgress;
    if (rp && typeof rp.toTrim === "number" && rp.toTrim > 0) {
      return `Refinement pass — trimmed ${rp.trimmed}/${rp.toTrim}`;
    }
    return "Refinement pass";
  })();

  const steps = [
    { key: "parsing", label: "Parsing preferences", done: false },
    { key: "recall", label: recallLabel, done: false },
    { key: "evaluating", label: evaluatingLabel, done: false },
    { key: "refining", label: refiningLabel, done: false },
  ];
  if (form.sequencing) {
    steps.push({ key: "sequencing", label: "Sequencing photos", done: false });
  }
  steps.push({ key: "completed", label: "Done", done: false });

  let passedCurrent = false;
  for (const s of steps) {
    if (s.key === currentBuildStep.value) {
      passedCurrent = true;
    } else if (!passedCurrent) {
      s.done = true;
    }
  }
  return steps;
});

// ── Presets ─────────────────────────────────────────────────
// Variant-specific genre presets. Commercial users only see the
// `commercial` preset; style/general users see the artistic genres.
const GENRE_PRESET_META = {
  general: { label: "General", icon: Camera20Regular },
  street: { label: "Street", icon: WalkOutline },
  documentary: { label: "Documentary", icon: BookOpen16Regular },
  abstract: { label: "Artistic", icon: PaletteOutlined },
  commercial: { label: "Commercial", icon: Camera20Regular },
};
const genrePresetOptions = computed(() => {
  const variant = getProfileVariant(useUserStore().user?.profiles);
  const keys = getGenrePresetKeys(variant);
  const built = keys.map((key) => ({
    value: key,
    label: GENRE_PRESET_META[key]?.label ?? key,
    icon: GENRE_PRESET_META[key]?.icon ?? Camera20Regular,
  }));
  built.push({ value: "custom", label: "Custom", icon: Settings20Regular });
  return built;
});

const applyPreset = (genre) => {
  selectedGenre.value = genre;
  if (genre !== "custom") {
    const preset = genrePresets[genre];
    if (preset) {
      form.weights = { ...preset };
    }
  }
};

// ── Weight mode switching ──────────────────────────────────
const setWeightMode = (mode) => {
  if (form.weightMode === mode) return;
  form.weightMode = mode;
  if (mode === "advanced" && selectedGenre.value === null) {
    applyPreset("general");
  }
};

const onAdvancedWeightsChange = (next) => {
  form.weights = next;
  // Manual edits always count as 'custom'.
  if (selectedGenre.value !== "custom") {
    selectedGenre.value = "custom";
  }
};

// ── Style preview (Describe mode) ──────────────────────────
// Live preview of the weight vector the backend will produce from the user's
// free-text style description. Debounced and request-id guarded so stale
// responses can't overwrite a newer one.
const stylePreviewResult = ref(null); // { emphasize, deemphasize, weights } | null
const isPreviewing = ref(false);
let previewReqId = 0;

const previewWeights = computed(() => {
  if (stylePreviewResult.value?.weights) {
    return stylePreviewResult.value.weights;
  }
  return portfolioStore.defaultWeights
    ? { ...portfolioStore.defaultWeights }
    : getFallbackWeights();
});

watch(
  () => form.stylePreferences,
  (val) => {
    if (!val.trim()) {
      stylePreviewResult.value = null;
    }
  },
);

const runStylePreview = async (text) => {
  const reqId = ++previewReqId;
  const trimmed = (text || "").trim();
  if (!trimmed) {
    stylePreviewResult.value = null;
    isPreviewing.value = false;
    return;
  }
  isPreviewing.value = true;
  try {
    const result = await portfolioStore.previewStyleWeights(trimmed);
    if (reqId !== previewReqId) return;
    stylePreviewResult.value = result;
  } finally {
    if (reqId === previewReqId) isPreviewing.value = false;
  }
};

// ── Coherence modes ────────────────────────────────────────
const coherenceModes = [
  {
    value: "free",
    label: "Flexible",
    description: "Based on pure quality selection.",
  },
  {
    value: "visual",
    label: "Visual",
    description: "Favor photos with similar visual style.",
  },

  {
    value: "chromatic",
    label: "Chromatic",
    description: "Group by color palette consistency.",
  },
  {
    value: "narrative",
    label: "Narrative",
    description: "Select photos that tell a story.",
  },
  {
    value: "heterogeneous",
    label: "Heterogeneous",
    description: "Maximize variety and diversity.",
  },
];

// "Free" is the default and stays full-width; the rest go in a 2×2 grid.
const defaultCoherenceMode = coherenceModes[0];
const otherCoherenceModes = coherenceModes.slice(1);

// ── Visual aspects tree-select options ──────────────────────
const treeSelectOptions = computed(() => {
  const opts = getVisualAspectsOptions(useUserStore().user?.profiles);
  return opts.map((group) => ({
    label: group.label,
    key: group.key,
    children: group.children.map((child) => ({
      label: child.label,
      key: `${group.key}:${child.value}`,
    })),
  }));
});

// ── Collection options ─────────────────────────────────────
const collectionOptions = computed(() => {
  return collectionsStore.allCollections.map((c) => ({
    label: c.title || c.name || `Collection ${c.id}`,
    value: c.id,
  }));
});

const handleCollectionsUpdate = (value) => {
  selectedCollections.value = value;
  collectionsDropdownShow.value = false; // Cerrar dropdown al seleccionar
};

// ── Credit estimation ──────────────────────────────────────
// Fetched from the backend so the formula is a single source of truth.
// Falls back to a local approximation while the request is in-flight or on error.
const estimatedCredits = ref(null); // null = loading/unknown
let creditEstimateDebounce = null;
let creditEstimateReqId = 0;

const fetchCreditEstimate = () => {
  if (!props.show) return; // Don't fetch while the wizard is not open
  if (buildMode.value === "manual") return; // Manual builds cost nothing
  if (creditEstimateDebounce) clearTimeout(creditEstimateDebounce);
  creditEstimateDebounce = setTimeout(async () => {
    const reqId = ++creditEstimateReqId;
    const result = await portfolioStore.fetchEstimateCredits({
      targetSize: form.targetSize,
      coherenceMode: form.coherenceMode,
      sequencing: form.sequencing,
      stylePreferences: form.stylePreferences,
    });
    if (reqId !== creditEstimateReqId) return;
    estimatedCredits.value = result;
  }, 400);
};

watch(
  [
    () => form.targetSize,
    () => form.coherenceMode,
    () => form.sequencing,
    () => form.stylePreferences,
  ],
  fetchCreditEstimate,
  { immediate: true },
);

const displayedCredits = computed(() => estimatedCredits.value);

// ── Validation ─────────────────────────────────────────────
const canSubmit = computed(() => {
  if (form.name.trim().length === 0) return false;
  if (form.targetSize < 10 || form.targetSize > 60) return false;
  if (sizeEligibility.value && sizeEligibility.value.eligible === false)
    return false;
  // In Advanced mode we need at least one non-zero weight. In Describe mode
  // the backend always falls back to a neutral baseline, so any state is
  // acceptable (empty text is allowed — it just means "no style bias").
  if (form.weightMode === "advanced") {
    return Object.values(form.weights).some((w) => w > 0);
  }
  return true;
});

// ── Filter-scoped eligibility (frontend-only) ──────────────
// Mirrors the backend pool formula. Keep in sync with
// PortfolioBuildService.requiredPoolForTargetSize.
const POOL_RECALL_MULTIPLIER = 7;
const POOL_RECALL_MAX = 800;
const POOL_OVER_GENERATE_RATIO = 0.35;
const POOL_OVER_GENERATE_MIN = 3;

function requiredPoolForTargetSize(targetSize) {
  const normalized = Math.max(10, Math.min(60, Math.ceil(targetSize)));
  const recallTarget = Math.min(
    normalized * POOL_RECALL_MULTIPLIER,
    POOL_RECALL_MAX,
  );
  const overBuffer = Math.max(
    POOL_OVER_GENERATE_MIN,
    Math.ceil(normalized * POOL_OVER_GENERATE_RATIO),
  );
  return Math.max(recallTarget, normalized + overBuffer);
}

// Evaluated whenever the filter state or targetSize changes. Only active when
// at least one filter is set (otherwise the global sizeEligibility covers it).
const filterEligibility = computed(() => {
  const hasFilters =
    selectedVisualAspects.value.length > 0 ||
    selectedCollections.value.length > 0 ||
    dateFrom.value != null ||
    dateTo.value != null;
  if (!hasFilters) return null;

  const analyzedPhotos = photosStore.processedPhotos;
  if (!analyzedPhotos || analyzedPhotos.length === 0) return null;

  // Build collection photo-ID set
  let collectionPhotoIdSet = null;
  if (selectedCollections.value.length > 0) {
    const ids = new Set();
    for (const collId of selectedCollections.value) {
      const coll = collectionsStore.allCollections.find((c) => c.id === collId);
      if (coll?.photoIds) {
        for (const photoId of coll.photoIds) ids.add(photoId);
      }
    }
    collectionPhotoIdSet = ids;
  }

  // Build visual-aspects filter map  { category: [values] }
  let vaFilter = null;
  if (selectedVisualAspects.value.length > 0) {
    vaFilter = {};
    for (const key of selectedVisualAspects.value) {
      const colonIdx = key.indexOf(":");
      if (colonIdx === -1) continue;
      const group = key.slice(0, colonIdx);
      const value = key.slice(colonIdx + 1);
      if (!vaFilter[group]) vaFilter[group] = [];
      vaFilter[group].push(value);
    }
  }

  // Build date range strings
  const dateFromStr = dateFrom.value
    ? new Date(dateFrom.value).toISOString().split("T")[0]
    : null;
  const dateToStr = dateTo.value
    ? new Date(dateTo.value).toISOString().split("T")[0]
    : null;

  let count = 0;
  for (const photo of analyzedPhotos) {
    // Collection filter
    if (collectionPhotoIdSet && !collectionPhotoIdSet.has(photo.id)) continue;

    // Visual aspects filter
    if (vaFilter) {
      const va = photo.descriptions?.visual_aspects;
      let pass = true;
      for (const [category, accepted] of Object.entries(vaFilter)) {
        if (!accepted || accepted.length === 0) continue;
        const photoVals = va?.[category];
        if (!photoVals) {
          pass = false;
          break;
        }
        const arr = Array.isArray(photoVals) ? photoVals : [photoVals];
        if (!arr.some((v) => accepted.includes(v))) {
          pass = false;
          break;
        }
      }
      if (!pass) continue;
    }

    // Date filter
    if (dateFromStr || dateToStr) {
      const dateTaken = photo.descriptions?.EXIF?.dateTaken;
      if (!dateTaken) continue;
      if (dateFromStr && dateTaken < dateFromStr) continue;
      if (dateToStr && dateTaken > dateToStr) continue;
    }

    count++;
  }

  const requiredPool = requiredPoolForTargetSize(form.targetSize);
  if (count >= requiredPool) return null; // eligible — no error to show
  return {
    eligible: false,
    reason: `Your current filters leave only ${count} analyzed photo${
      count === 1 ? "" : "s"
    } in scope. You need at least ${requiredPool} to build a portfolio of ${form.targetSize} photos. Try removing some filters.`,
    requiredPool,
    stats: { analyzed: count },
  };
});

// ── Dynamic size eligibility ───────────────────────────────
// The backend enforces that the user has enough *analyzed* photos to feed the
// recall/evaluation pool for the chosen targetSize. We re-check every time the
// slider settles so the user sees live feedback.
const sizeEligibility = ref(null);
const isCheckingEligibility = ref(false);
let eligibilityDebounce = null;
let eligibilityReqId = 0;

const runEligibilityCheck = async (size, collectionIds) => {
  const reqId = ++eligibilityReqId;
  isCheckingEligibility.value = true;
  try {
    const result = await portfolioStore.checkEligibility(size, collectionIds);
    if (reqId !== eligibilityReqId) return; // stale
    sizeEligibility.value = result;
  } catch (e) {
    if (reqId !== eligibilityReqId) return;
    // On error, don't block the user — backend will enforce on submit.
    sizeEligibility.value = null;
  } finally {
    if (reqId === eligibilityReqId) isCheckingEligibility.value = false;
  }
};

watch(
  [() => form.targetSize, selectedCollections],
  ([size, collections]) => {
    if (eligibilityDebounce) clearTimeout(eligibilityDebounce);
    eligibilityDebounce = setTimeout(
      () => runEligibilityCheck(size, collections),
      250,
    );
  },
  { immediate: true },
);

// Block moving past the Size step if the user is not eligible for the chosen size.
// Also block past the Filters step if the chosen filters reduce the pool too much.
const canAdvance = computed(() => {
  if (currentStepKey.value === "size") {
    if (isCheckingEligibility.value) return false;
    if (sizeEligibility.value && sizeEligibility.value.eligible === false)
      return false;
  }
  if (currentStepKey.value === "filters") {
    if (filterEligibility.value && filterEligibility.value.eligible === false)
      return false;
  }
  return true;
});

// ── Footer notice ──────────────────────────────────────────
// Warnings and disclaimers are rendered in the footer (above the credit badge)
// rather than inside the slides: slides have a fixed height, so anything
// appended to them ends up below the fold. One notice at a time, scoped to the
// step that produced it.
const footerNotice = computed(() => {
  if (currentStepKey.value === "name") {
    if (form.themePreferences.trim().length > 90) {
      return {
        tone: "info",
        text: "Please note that this text acts only as a soft bias. For stricter thematic filter, consider filtering by collections in the next steps.",
      };
    }
    return null;
  }

  if (currentStepKey.value === "size") {
    const eligibility = sizeEligibility.value;
    if (
      eligibility &&
      eligibility.eligible === false &&
      !isCheckingEligibility.value
    ) {
      return {
        tone: "error",
        text: eligibility.reason,
        hint:
          eligibility.stats && typeof eligibility.requiredPool === "number"
            ? "Try reducing the portfolio size, or analyze more photos from your catalog."
            : null,
      };
    }
    return null;
  }

  if (currentStepKey.value === "filters") {
    const eligibility = filterEligibility.value;
    if (eligibility && eligibility.eligible === false) {
      return {
        tone: "error",
        title: "Not enough analyzed photos",
        text: eligibility.reason,
        // hint: "Try removing some filters, reducing the portfolio size, or analyze more photos from your catalog.",
      };
    }
  }

  return null;
});

// ── Submit ─────────────────────────────────────────────────
const handleSubmit = async () => {
  if (!canSubmit.value) return;

  // In Describe mode we send the free-text style description and let the
  // backend parse it into emphasized criteria on top of a neutral baseline.
  // In Advanced mode we send the user's explicit weight vector as before.
  const config = {
    name: form.name.trim(),
    targetSize: form.targetSize,
    coherenceMode: form.coherenceMode,
    sequencing: form.sequencing,
  };

  if (props.targetSetId) {
    config.setId = props.targetSetId;
  }

  if (form.weightMode === "advanced") {
    config.weights = Object.fromEntries(
      Object.entries(form.weights).map(([k, v]) => [k, v * 10]),
    );
  } else {
    // If a cached preview already resolved to concrete weights, send them too
    // so the backend can skip the parse LLM call. Backend is free to ignore.
    if (stylePreviewResult.value?.weights) {
      config.weights = Object.fromEntries(
        Object.entries(stylePreviewResult.value.weights).map(([k, v]) => [
          k,
          v * 10,
        ]),
      );
    }
  }

  // Always forward a non-empty style description regardless of weight mode —
  // the backend passes it to the evaluation and refinement LLMs as context.
  const style = form.stylePreferences.trim();
  if (style) config.stylePreferences = style;

  if (form.themePreferences.trim()) {
    config.themePreferences = form.themePreferences.trim();
  }
  if (form.sequencing && form.sequencingPreferences.trim()) {
    config.sequencingPreferences = form.sequencingPreferences.trim();
  }

  const filters = {};
  if (selectedVisualAspects.value.length > 0) {
    const va = {};
    for (const key of selectedVisualAspects.value) {
      const [group, value] = key.split(":");
      if (!va[group]) va[group] = [];
      va[group].push(value);
    }
    filters.visualAspects = va;
  }
  if (dateFrom.value) {
    filters.dateFrom = new Date(dateFrom.value).toISOString().split("T")[0];
  }
  if (dateTo.value) {
    filters.dateTo = new Date(dateTo.value).toISOString().split("T")[0];
  }
  if (selectedCollections.value.length > 0) {
    filters.collectionIds = selectedCollections.value;
  }
  if (Object.keys(filters).length > 0) {
    config.filters = filters;
  }

  isBuilding.value = true;
  currentBuildStep.value = "parsing";

  try {
    const result = await portfolioStore.startBuild(config);
    const buildId = result.buildId;
    console.log("[PortfolioBuildWizard] Build started, id:", buildId);

    // Start polling for status updates
    pollTimer = setInterval(async () => {
      try {
        const status = await portfolioStore.getBuildStatus(buildId);
        if (status.status) {
          currentBuildStep.value = status.status;
        }
        if (status.result) {
          buildProgressDetail.value = {
            recallSize: status.result.recallSize ?? null,
            evaluationProgress: status.result.evaluationProgress ?? null,
            refinementProgress: status.result.refinementProgress ?? null,
          };
        }
        if (status.status === "completed") {
          stopPolling();
          await portfolioStore.fetchBuilds();
          message.success("Portfolio build completed!");
          emit("build-complete", status);
          emit("update:show", false);
          resetForm();
          isBuilding.value = false;
          currentBuildStep.value = "";
        } else if (status.status === "failed") {
          stopPolling();
          message.error(status.error || "Build failed");
          isBuilding.value = false;
          currentBuildStep.value = "";
        }
      } catch (pollErr) {
        console.error("[PortfolioBuildWizard] Poll error:", pollErr);
      }
    }, 2000);
  } catch (error) {
    console.error("[PortfolioBuildWizard] Build error:", error);
    const msg =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Build failed";
    message.error(msg);
    isBuilding.value = false;
    currentBuildStep.value = "";
  }
};

// ── Manual create ──────────────────────────────────────────
// No AI build runs: we create an empty portfolio and let the parent navigate
// to the detail view where the user picks the photos.
const isCreatingManual = ref(false);

const handleManualCreate = async () => {
  const name = form.name.trim();
  if (!name || isCreatingManual.value) return;
  isCreatingManual.value = true;
  try {
    const { buildId } = await portfolioStore.createManual({
      name,
      description: form.description.trim() || undefined,
      setId: props.targetSetId || null,
    });
    emit("update:show", false);
    resetForm();
    emit("manual-created", buildId);
  } catch (error) {
    console.error("[PortfolioBuildWizard] Manual create error:", error);
    message.error(error.response?.data?.error || "Failed to create portfolio");
  } finally {
    isCreatingManual.value = false;
  }
};

// ── Chat assisted ──────────────────────────────────────────
// Nothing is created here: the wizard just hands off to the chat modal, which
// runs its own setup form and creates the portfolio from the curated selection.
const handleChatAssisted = () => {
  emit("update:show", false);
  resetForm();
  emit("chat-assisted");
};

const handleClose = () => {
  if (isBuilding.value) return;
  stopPolling();
  emit("update:show", false);
};

onUnmounted(() => {
  stopPolling();
  if (eligibilityDebounce) clearTimeout(eligibilityDebounce);
  if (creditEstimateDebounce) clearTimeout(creditEstimateDebounce);
});

const resetForm = () => {
  stopPolling();
  buildMode.value = "ai";
  form.name = "";
  form.description = "";
  form.targetSize = 20;
  form.weightMode = "advanced";
  form.stylePreferences = "";
  form.weights = portfolioStore.defaultWeights
    ? { ...portfolioStore.defaultWeights }
    : getFallbackWeights();
  form.coherenceMode = "free";
  form.themePreferences = "";
  form.sequencing = false;
  form.sequencingPreferences = "";
  applyPreset("general");
  selectedVisualAspects.value = [];
  selectedCollections.value = [];
  dateFrom.value = null;
  dateTo.value = null;
  currentStep.value = 0;
  stylePreviewResult.value = null;
  isPreviewing.value = false;
  estimatedCredits.value = null;
  buildProgressDetail.value = {
    recallSize: null,
    evaluationProgress: null,
    refinementProgress: null,
  };
};

const fillFromConfig = (config) => {
  resetForm();
  if (!config) return;

  if (config.name) form.name = config.name;
  if (typeof config.targetSize === "number")
    form.targetSize = config.targetSize;
  if (config.coherenceMode) form.coherenceMode = config.coherenceMode;
  if (config.themePreferences) form.themePreferences = config.themePreferences;
  if (typeof config.sequencing === "boolean")
    form.sequencing = config.sequencing;
  if (config.sequencingPreferences)
    form.sequencingPreferences = config.sequencingPreferences;

  // Weights are stored ×10 — normalise back to 0-1 for the sliders.
  if (config.stylePreferences) {
    form.weightMode = "describe";
    form.stylePreferences = config.stylePreferences;
  } else if (config.weights && Object.keys(config.weights).length > 0) {
    form.weightMode = "advanced";
    form.weights = Object.fromEntries(
      Object.entries(config.weights).map(([k, v]) => [k, v / 10]),
    );
    selectedGenre.value = "custom";
  }

  // Filters
  const filters = config.filters || {};
  if (
    Array.isArray(filters.collectionIds) &&
    filters.collectionIds.length > 0
  ) {
    selectedCollections.value = [...filters.collectionIds];
  }
  if (filters.dateFrom) {
    dateFrom.value = new Date(filters.dateFrom).getTime();
  }
  if (filters.dateTo) {
    dateTo.value = new Date(filters.dateTo).getTime();
  }
  if (filters.visualAspects && typeof filters.visualAspects === "object") {
    const aspects = [];
    for (const [group, values] of Object.entries(filters.visualAspects)) {
      for (const value of values) {
        aspects.push(`${group}:${value}`);
      }
    }
    selectedVisualAspects.value = aspects;
  }
};

watch(
  () => props.show,
  async (val) => {
    if (!val) return;
    // Fetch backend defaults before resetting the form so the weight sliders
    // start from the portfolio-specific baseline rather than a local guess.
    // The request is cheap and cached after the first call.
    await portfolioStore.fetchDefaultWeights();
    if (props.prefillConfig) {
      fillFromConfig(props.prefillConfig);
    } else {
      resetForm();
    }
    // Explicitly kick off a fresh estimate now that the wizard is open.
    // This is necessary because resetForm() nulls estimatedCredits, but the
    // form-values watcher won't re-fire if targetSize/coherenceMode didn't
    // change from their current (already-default) values.
    fetchCreditEstimate();
  },
);
</script>

<!-- Dialog chrome. Not scoped: the modal is teleported, so the scope id never
     reaches the .n-dialog root and scoped rules would silently do nothing.
     Selectors are kept specific enough to win over naive's runtime styles. -->
<style>
/* The dialog keeps the exact same total height on every step so the footer —
   and with it the Next button — never moves. `--wiz-total` is that height;
   `--wiz-top` is the space above the wizard (room for the close button), and
   the wizard body simply takes whatever is left. */
.n-dialog.build-wizard-modal {
  --wiz-total: 490px;
  --wiz-top: 36px;
  padding-top: var(--wiz-top);
  padding-bottom: 0;
}

/* The mode step hides the close button, so it can start right at the top —
   the wizard body grows by the same amount and the total stays put. */
.n-dialog.build-wizard-modal.mode-step {
  --wiz-top: 4px;
}

/* The header slot is empty and the content margins are folded into --wiz-top. */
.n-dialog.build-wizard-modal .n-dialog__title {
  display: none;
}

.n-dialog.build-wizard-modal .n-dialog__content {
  margin: 0;
}
</style>

<style scoped>
/* ── Stepped layout ─────────────────────────────────────── */
/* `--wiz-total` is the *baseline* height: every step without a footer notice
   gets exactly the same one, so the Next button never moves between steps.
   When a footer notice appears the dialog grows by its height instead of
   stealing space from the slide — hence min-height, not height. */
.wizard-stepped {
  display: flex;
  flex-direction: column;
  min-height: calc(var(--wiz-total, 490px) - var(--wiz-top, 36px));
  max-height: 85vh;
}

/* ── Wizard tabs ─────────────────────────────────────────── */
.wizard-tabs {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  padding: 0 16px;
  gap: 0;
}

.wizard-tab {
  position: relative;
  flex: 1;
  padding: 7px 4px;
  background: none;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: default;
  transition: color 0.15s;
  white-space: nowrap;
}

.tab-icon {
  opacity: 0.4;
  transition: opacity 0.15s;
}

.tab-label {
  font-size: 12px;
  line-height: 1;
}

.wizard-tab:not(:disabled) {
  cursor: pointer;
}

.wizard-tab:not(:disabled):hover {
  color: var(--text-secondary);
}

.wizard-tab:not(:disabled):hover .tab-icon {
  opacity: 0.7;
}

.wizard-tab.active {
  color: var(--primary-color);
  font-weight: 600;
}

.wizard-tab.active .tab-icon {
  opacity: 1;
}

.wizard-tab.active::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 6px;
  right: 6px;
  height: 2px;
  background: var(--primary-color);
  border-radius: 1px;
}

.wizard-tab.completed {
  color: var(--text-secondary);
}

.wizard-tab.completed .tab-icon {
  opacity: 0.7;
}

/* ── Slide container ────────────────────────────────────── */
/* Grows to fill the baseline height, but its flex basis is its own content:
   that way a taller footer makes the dialog grow instead of squeezing the step.
   It only shrinks (and scrolls) once the dialog hits its 85vh cap. */
.slide-container {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  /* The slide transition translates sideways — never let that scroll the page. */
  overflow-x: hidden;
  /* Reserve the scrollbar so steps that overflow don't reflow the ones that don't. */
  scrollbar-gutter: stable;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
}

.slide {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 0 auto;
}

.slide-header {
  margin-bottom: 4px;
}

.slide-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.slide-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* Short steps center their body in the leftover space instead of leaving a
   large gap at the bottom; tall steps fill it and are unaffected. */
.slide-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 9px;
  /* flex: 1 0 auto; */
}

/* ── Slide transitions ──────────────────────────────────── */
.slide-left-enter-active,
.slide-right-enter-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.slide-left-leave-active,
.slide-right-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-24px);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

/* ── Build mode step ────────────────────────────────────── */
/* No tabs here, so center the whole block in the taller slide area. */
.mode-slide {
  justify-content: center;
}

.mode-slide .slide-body {
  flex: 0 0 auto;
}

.mode-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 8px;
}

.mode-header-icon {
  display: inline-flex;
  padding: 12px;
  margin-bottom: 12px;
  border-radius: var(--radius-md);
  background: var(--primary-08);
  border: 1px solid var(--primary-15);
}

.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

/* Paired with the wider dialog the mode step asks for (see `modalWidth`), so
   each of the three cards still gets roughly the room two had at 700px. */
.mode-grid--three {
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.mode-grid--three .mode-card {
  padding: 22px 16px 18px;
}

.mode-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 18px 20px;
  border-radius: var(--radius-lg);
  text-align: center;
  overflow: hidden;
}

.mode-card-icon {
  display: inline-flex;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--primary-08);
  transition: background 0.25s ease;
}

.mode-card:hover .mode-card-icon,
.mode-card.is-selected .mode-card-icon {
  background: var(--primary-15);
}

.mode-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.mode-card-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.mode-card-tag {
  margin-top: auto;
}

.mode-check {
  position: absolute;
  top: 10px;
  right: 10px;
  color: var(--primary-color);
  opacity: 0;
  transform: scale(0.8);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.mode-card.is-selected .mode-check {
  opacity: 1;
  transform: scale(1);
}

/* ── Target size ─────────────────────────────────────────── */
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
  min-width: 60px;
}

.size-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.size-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ── Presets ─────────────────────────────────────────────── */
.preset-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preset-section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.preset-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.preset-button {
  border-radius: 6px !important;
  font-size: 12px !important;
  background-color: var(--bg-surface);
}

/* ── Weight mode toggle ─────────────────────────────────── */
.weight-mode-toggle {
  display: none;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--border-color) 50%, transparent);
  border: 1px solid var(--border-color);
  width: 100%;
}

.weight-mode-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 16px;
  flex: 1;
  background: transparent;
  border: none;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.weight-mode-option:hover:not(.active) {
  color: var(--text-primary);
}

.weight-mode-option.active {
  background: var(--bg-card);
  color: var(--primary-color);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

/* ── Weight mode content wrapper ───────────────────────── */
.weight-mode-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.weight-mode-enter-active {
  transition: opacity 0.18s ease;
}
.weight-mode-leave-active {
  transition: opacity 0.12s ease;
}
.weight-mode-enter-from,
.weight-mode-leave-to {
  opacity: 0;
}

/* ── Style preview header ───────────────────────────────── */
.style-preview-trigger {
  display: flex;
  justify-content: flex-end;
  margin-top: -6px;
}

.style-preview-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

.style-preview-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
  text-align: right;
  line-height: 1.4;
}

.style-preview-chip {
  color: var(--primary-color);
  font-weight: 600;
  font-style: normal;
}

/* ── Filters ─────────────────────────────────────────────── */
.filter-row {
  display: flex;
  gap: 12px;
}

.filter-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* ── Coherence ───────────────────────────────────────────── */
.coherence-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.coherence-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.coherence-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s;
}

.coherence-option.default .coherence-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.coherence-option:hover {
  border-color: var(--text-tertiary);
}

.coherence-option.selected {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}

.coherence-option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.coherence-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.coherence-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* ── Sequencing ─────────────────────────────────────────── */
.sequencing-toggle {
  display: flex;
  align-items: center;
}

.sequencing-label {
  margin-left: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── Footer notice (warnings + disclaimers) ─────────────── */
.footer-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text-primary);
  overflow: hidden;
}

.footer-notice .n-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.footer-notice.info {
  background: color-mix(in srgb, var(--info-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--info-color) 20%, transparent);
}

.footer-notice.info .n-icon {
  color: var(--info-color);
}

.footer-notice.error {
  background: color-mix(in srgb, var(--error-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--error-color) 25%, transparent);
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

.footer-notice-text strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--error-color);
}

.footer-notice-hint {
  color: var(--text-tertiary);
}

.hint-fade-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease,
    max-height 0.25s ease;
}
.hint-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    max-height 0.18s ease;
}
.hint-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
  max-height: 0;
}
.hint-fade-enter-to,
.hint-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 160px;
}
.hint-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
  max-height: 0;
}

/* ── Footer ─────────────────────────────────────────────── */
.wizard-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 32px 20px;
  border-top: 1px solid var(--border-color);
}

/* Without the credit estimate the footer is a single row — keep it centered. */
.wizard-footer.compact {
  padding: 14px 32px 16px;
}

.credit-estimate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--warning-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning-color) 22%, transparent);
}

.credit-estimate-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.credit-estimate-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.credit-estimate-value {
  font-size: 13px;
  color: var(--warning-color);
  font-weight: 600;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-spacer {
  flex: 1;
}

.step-counter {
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ── Building overlay ───────────────────────────────────── */
/* Same height as the wizard body, so starting a build doesn't resize the dialog. */
.building-overlay {
  height: calc(var(--wiz-total, 490px) - var(--wiz-top, 36px));
  max-height: 85vh;
  padding: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.building-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.building-title {
  margin: 8px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.building-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  max-width: 400px;
}

.building-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  align-items: flex-start;
}

.build-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.build-step.active {
  color: var(--accent-color);
  font-weight: 600;
}

.build-step.done {
  color: var(--primary-color);
}

/* ── Custom pulsating grid spinner ─────────────────────── */
.build-grid-spinner {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
  width: 56px;
  height: 56px;
  margin-bottom: 4px;
}

.build-grid-cell {
  background: var(--primary-color);
  border-radius: 2px;
  opacity: 0.18;
  transform: scale(0.85);
  animation: build-grid-pulse 1.4s ease-in-out infinite;
  animation-delay: calc(var(--cell-index) * 0.1s);
  will-change: opacity, transform;
}

@keyframes build-grid-pulse {
  0%,
  70%,
  100% {
    opacity: 0.18;
    transform: scale(0.85);
  }
  35% {
    opacity: 1;
    transform: scale(1);
  }
}

/* ── Scrollbar ──────────────────────────────────────────── */
.slide-container::-webkit-scrollbar {
  width: 6px;
}

.slide-container::-webkit-scrollbar-track {
  background: transparent;
}

.slide-container::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.slide-container::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

/* ── Responsive ─────────────────────────────────────────── */
/* Height breakpoints live in the unscoped block above, with --wiz-total. */
@media (max-width: 640px) {
  .wizard-tabs {
    padding: 0 8px;
  }

  .wizard-tab {
    font-size: 11px;
    padding: 7px 2px;
  }

  .slide-container {
    padding: 16px;
  }

  .mode-grid {
    grid-template-columns: 1fr;
  }

  .wizard-footer {
    padding: 12px 16px 16px;
  }

  .target-size-control {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .target-size-display {
    flex-direction: row;
    gap: 6px;
    justify-content: center;
  }

  .filter-row {
    flex-direction: column;
  }
}
</style>
