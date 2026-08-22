<template>
  <n-modal
    :show="show"
    :style="{ width: '550px', maxWidth: '95vw' }"
    @update:show="(val) => !val && emit('close')"
  >
    <n-card :bordered="false" role="dialog" aria-modal="true" class="fam-card">
      <template #header-extra>
        <n-button text @click="emit('close')" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="fam-hero">
        <div class="fam-icon-badge">
          <n-icon :size="26"><RocketLaunchOutlined /></n-icon>
        </div>
        <h3 class="fam-title">
          {{ title }}
          <span
            v-if="isRecommendation"
            class="fam-title-icon"
            aria-hidden="true"
            >🥀</span
          >
        </h3>
        <p class="fam-subtitle" v-html="subtitle"></p>
      </div>

      <div v-if="isRecommendation" class="fam-info-box">
        <n-icon :size="16" color="var(--info-color)" class="fam-info-icon">
          <InformationCircleOutline />
        </n-icon>
        <span>
          We suggest starting with at least
          <strong>{{ minRequired }} photos</strong> for a better first
          experience.
          <!-- You currently have
          <strong
            >{{ selectedCount }} photo{{
              selectedCount !== 1 ? "s" : ""
            }}</strong
          >
          selected — you're free to continue with fewer if you'd rather. -->
        </span>
      </div>

      <template v-else>
        <div class="fam-progress-card">
          <div class="fam-progress-stats">
            <div class="fam-stat">
              <span class="fam-stat-value">{{ selectedCount }}</span>
              <span class="fam-stat-label"
                >selected photo{{ selectedCount !== 1 ? "s" : "" }}</span
              >
            </div>
            <n-icon :size="16" class="fam-stat-arrow">
              <ArrowForwardOutline />
            </n-icon>
            <div class="fam-stat">
              <span class="fam-stat-value fam-stat-value--target">{{
                minRequired
              }}</span>
              <span class="fam-stat-label">minimum required</span>
            </div>
          </div>
          <n-progress
            type="line"
            :percentage="progressPercent"
            :show-indicator="false"
            :height="8"
            color="var(--primary-color)"
            rail-color="rgba(255, 255, 255, 0.08)"
            class="fam-progress-bar"
          />
          <p class="fam-progress-caption">
            Add
            <strong
              >{{ photosNeeded }} more photo{{
                photosNeeded !== 1 ? "s" : ""
              }}</strong
            >
            to unlock your first analysis
          </p>
        </div>

        <div class="fam-info-box">
          <n-icon :size="16" color="var(--info-color)" class="fam-info-icon">
            <InformationCircleOutline />
          </n-icon>
          <span>
            Photoreka is designed to work with
            <strong>photo collections</strong> or
            <strong>whole libraries</strong>, not single photos. A bigger first
            batch means better results from day one. After this first analysis,
            you can add photos in smaller batches.
          </span>
        </div>
      </template>

      <div v-if="isRecommendation" class="fam-dismiss">
        <n-checkbox
          :checked="dontShowAgain"
          @update:checked="emit('update:dontShowAgain', $event)"
        >
          Don't show this again
        </n-checkbox>
      </div>

      <template #footer>
        <div class="fam-footer">
          <n-button v-if="!isRecommendation" tertiary @click="emit('close')"
            >Maybe later</n-button
          >
          <n-button
            v-if="isRecommendation"
            type="primary"
            @click="emit('continue-anyway')"
          >
            <template #icon>
              <n-icon><RocketLaunchOutlined /></n-icon>
            </template>
            Continue anyway
          </n-button>
          <n-button type="info" @click="emit('add-more-photos')">
            <template #icon>
              <n-icon><CloudUploadOutline /></n-icon>
            </template>
            Add more photos
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
import { computed } from "vue";
import { NModal, NCheckbox } from "naive-ui";
import {
  ArrowForwardOutline,
  CloseOutline,
  CloudUploadOutline,
  InformationCircleOutline,
} from "@vicons/ionicons5";
import { RocketLaunchOutlined } from "@vicons/material";

const props = defineProps({
  show: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 },
  minRequired: { type: Number, default: 0 },
  photosNeeded: { type: Number, default: 0 },
  progressPercent: { type: Number, default: 0 },
  isRecommendation: { type: Boolean, default: false },
  dontShowAgain: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:dontShowAgain",
  "close",
  "continue-anyway",
  "add-more-photos",
]);

// Recommendation mode is dismissible/bypassable, so the copy (and the absence
// of a hard progress bar) shouldn't read as a gate the way restriction mode does.
const title = computed(() =>
  props.isRecommendation
    ? "Your first batch is a bit small"
    : "Unlock your first analysis",
);
const subtitle = computed(() =>
  props.isRecommendation
    ? "Photoreka is a curation platform designed to work with <strong>photo collections</strong> or <strong>whole libraries</strong>. It's not intended for small batches or single photos."
    : "A bigger first batch gives Photoreka's tools something real to work with.",
);
</script>

<style scoped>
.fam-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.fam-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding-bottom: var(--spacing-md);
}

.fam-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    var(--primary-color) 0%,
    var(--accent-color, var(--primary-color)) 100%
  );
  color: #fff;
}

.fam-title {
  margin: 0;
  font-size: var(--font-size-xl, 20px);
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.fam-title-icon {
  font-size: 0.95em;
}

.fam-subtitle {
  margin: 0;
  /* max-width: 500px; */
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.fam-progress-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 22%, transparent);
  border-radius: var(--radius-md);
  padding: var(--spacing-md) var(--spacing-lg);
}

.fam-progress-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-lg);
}

.fam-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 96px;
}

.fam-stat-value {
  font-size: 28px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary);
  line-height: 1;
}

.fam-stat-value--target {
  color: var(--accent-color);
}

.fam-stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.fam-stat-arrow {
  color: var(--text-secondary);
  opacity: 0.7;
  margin-top: -14px;
}

.fam-progress-bar {
  margin: 0;
}

.fam-progress-caption {
  margin: 0;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.fam-progress-caption strong {
  color: var(--primary-color);
}

.fam-info-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background-color: color-mix(in srgb, var(--info-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--info-color) 25%, transparent);
  border-left: 3px solid var(--info-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.fam-info-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.fam-dismiss {
  padding-top: var(--spacing-md);
}

.fam-footer {
  display: flex;
  justify-content: center;
  gap: 10px;
}
</style>
